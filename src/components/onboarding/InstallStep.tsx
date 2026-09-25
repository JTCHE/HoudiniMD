import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { invoke } from "@/lib/backend";
import { pickInstall, type Install } from "@/lib/install";
import { CHOICE_HANG, ChoiceRow } from "./ChoiceRow";

/**
 * The first thing the app asks for: which Houdini it reads.
 *
 * The list is what the scan found, newest build first, and the last row is the
 * way to a build the scan cannot see — a studio install on another drive. That
 * row goes through `pickInstall`, the same call the version picker in the
 * sidebar makes.
 */
export function InstallStep({
  value,
  onChange,
  onError,
}: {
  /** The build the reader has chosen, or "" while the scan is still running. */
  value: string;
  onChange: (version: string) => void;
  onError: (reason: string) => void;
}) {
  const [installs, setInstalls] = useState<Install[] | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let live = true;
    void invoke<Install[]>("installs", { refresh: true })
      .catch(() => [])
      .then((found) => {
        if (!live) return;
        setInstalls(found);
        // The newest build on the machine is the default, so a reader who
        // presses Enter through the whole setup gets the right one.
        if (found[0]) onChange(found[0].version);
      });
    return () => {
      live = false;
    };
    // Mount only: a re-scan on every keystroke of the parent would fight the
    // reader's own choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** `pickInstall` adds the folder and switches to it, so the list is re-read
      and the new build becomes the chosen one. */
  async function browse() {
    setPicking(true);
    try {
      if (!(await pickInstall())) return;
      const found = await invoke<Install[]>("installs", { refresh: true }).catch(() => []);
      setInstalls(found);
      const now = await invoke<Install | null>("current_install").catch(() => null);
      if (now) onChange(now.version);
    } catch (reason) {
      onError(String(reason));
    } finally {
      setPicking(false);
    }
  }

  if (installs === null) {
    return <p className="text-meta text-neutral-500">Looking for Houdini on this machine…</p>;
  }

  return (
    <div className={cn(CHOICE_HANG, "flex flex-col gap-sm")}>
      {installs.length === 0 && (
        <p className="px-[13px] text-meta text-neutral-500">
          No Houdini install found on this machine. Install Houdini, or pick the folder of one.
        </p>
      )}
      {installs.map((install) => (
        <ChoiceRow
          key={install.root}
          label={`Houdini ${install.version}`}
          detail={install.root}
          chosen={install.version === value}
          onClick={() => onChange(install.version)}
        />
      ))}
      <ChoiceRow
        label="Pick a folder…"
        detail={picking ? "Reading…" : "Elsewhere on this machine"}
        onClick={() => void browse()}
      />
    </div>
  );
}
