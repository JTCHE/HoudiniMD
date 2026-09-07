/**
 * The Houdini the app is reading, and the size of its documentation.
 *
 * Both the sidebar and the landing hero name the build, so the read happens
 * once here rather than in each of them. The titles are already cached for the
 * session by `lib/search.ts`, so asking for the page count costs nothing after
 * the first ask.
 */
import { useEffect, useState } from "react";
import { invoke, listen } from "./backend";
import { titles, forgetTitles } from "@/lib/search";

export interface Install {
  version: string;
  root: string;
  help: string;
}

export interface BuildInfo {
  /** `null` while it is still being read, then the version or an empty string
      when the machine has no Houdini on it. */
  version: string | null;
  pageCount: number | null;
}

/**
 * The reader's own name, for the greeting.
 *
 * The platform gives a login name, so `jane.doe` and `JOHN` both arrive. The
 * greeting wants one word a person recognises: take what comes before the
 * first separator and put one capital on it. An empty answer greets nobody,
 * which is what a machine with no user name deserves.
 */
export function useUserName(): string {
  const [name, setName] = useState("");

  useEffect(() => {
    let live = true;
    void invoke<string>("user_name")
      .catch(() => "")
      .then((raw) => {
        if (live) setName(firstName(raw));
      });
    return () => {
      live = false;
    };
  }, []);

  return name;
}

function firstName(raw: string): string {
  // `DOMAIN\jane.doe` and `JOHN` both arrive, so the domain goes first.
  const account = raw.trim().split("\\").pop() ?? "";
  const word = account.split(/[@._\- ]/)[0] ?? "";
  if (!word) return "";
  // A shouted login is a login, not a name; a mixed one is left alone.
  const rest = word === word.toUpperCase() ? word.slice(1).toLowerCase() : word.slice(1);
  return word.charAt(0).toUpperCase() + rest;
}

export function useBuild(): BuildInfo {
  const [build, setBuild] = useState<BuildInfo>({ version: null, pageCount: null });

  useEffect(() => {
    let live = true;
    // The install the reader CHOSE, not the newest one on the machine. The
    // page count below follows the chosen build, so reading the version from
    // anywhere else makes the two lines of the card disagree.
    const readVersion = () => {
      void invoke<Install | null>("current_install")
        .catch(() => null)
        .then((install) => {
          if (live) setBuild((current) => ({ ...current, version: install?.version ?? "" }));
        });
    };
    const readCount = () => {
      void titles().then((all) => {
        if (live) setBuild((current) => ({ ...current, pageCount: all.length }));
      });
    };
    readVersion();
    readCount();
    // On a fresh index the count is read before the background pass has
    // written every page (Nodes lands last — it is the biggest zip by far).
    // Read it again once the pass is done, so the count does not stay stuck
    // at that first, partial read for the rest of the session.
    const stop = listen<{ done: boolean }>("index", (event) => {
      if (!event.payload.done) return;
      forgetTitles();
      readCount();
    });
    // The version picker switches the build this process reads; every mount
    // of this hook reads it the same way a fresh page load would.
    const offBuildChange = onBuildChanged(() => {
      forgetTitles();
      readVersion();
      readCount();
    });
    return () => {
      live = false;
      void stop.then((off) => off());
      offBuildChange();
    };
  }, []);

  return build;
}

/**
 * Asks the reader for a Houdini folder and reads the build in it.
 *
 * The scan only looks where the installer puts a build, so a studio install on
 * another drive arrives through here. The version picker and the first-launch
 * onboarding both call this, so a folder that works in one works in the other.
 *
 * `false` when the reader closed the picker without choosing. Throws with what
 * to say when the folder holds no help.
 */
export async function pickInstall(): Promise<boolean> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const folder = await open({
    directory: true,
    multiple: false,
    title: "Pick a Houdini install folder",
  });
  if (typeof folder !== "string") return false;
  await invoke("add_install", { path: folder });
  announceBuildChanged();
  return true;
}

const buildListeners = new Set<() => void>();

/** Tells every `useBuild` to re-read the version and page count. Called after
    the version picker switches the build this process reads. */
export function announceBuildChanged() {
  for (const notify of buildListeners) notify();
}

/** Runs when the version picker switches the build this process reads. The
    reading view uses it to read the open page again out of the new build. */
export function onBuildChanged(run: () => void): () => void {
  buildListeners.add(run);
  return () => buildListeners.delete(run);
}
