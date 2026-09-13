/**
 * The menu behind a right-click on the app's name in the title bar.
 *
 * Two ways to start again: throw away what was derived from the Houdini
 * install, or throw away the reader's own data — which includes the fact that
 * they have run the setup, so the window comes back on the first launch.
 * In every build, not only in a development one. See spec: Right click on
 * HoudiniMD in title bar.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { invoke } from "@/lib/backend";
import { showToast } from "@/components/ui/toast-notification";
import { TELEMETRY } from "@/components/onboarding/Onboarding";
import { Icons } from "@/lib/ui/icons";

const ITEM =
  "flex w-full cursor-interactive items-center rounded-md px-sm py-[7px] text-left text-[13px] " +
  "text-neutral-800 transition-colors duration-(--duration-fast) motion-reduce:transition-none " +
  "pointer-hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function TitleBarMenu({ at, onClose }: { at: { x: number; y: number }; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  // The settings pane is cut from the beta, and the telemetry must be one
  // click from off at any time, so its switch lives here until the pane is back.
  const [telemetry, setTelemetry] = useState<boolean | null>(null);

  useEffect(() => {
    void invoke<string | null>("get_setting", { key: TELEMETRY })
      .then((value) => setTelemetry(value === "true"))
      .catch(() => {});
  }, []);

  async function toggleTelemetry() {
    const next = !telemetry;
    await invoke("set_setting", { key: TELEMETRY, value: String(next) });
    setTelemetry(next);
  }

  useEffect(() => {
    const shut = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", shut);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", shut);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  /** Answered on the click, not after the backend: the pass reports its own
      progress, and every count falls to nothing and climbs back with it. */
  function resetIndex() {
    showToast("Index cleared. Reading the install again…");
    onClose();
    invoke("reset_index").catch((reason) => showToast(String(reason), "error"));
  }

  /** Bookmarks, recents and settings are the reader's own work and nothing
      puts them back, so this asks first. What the webview kept goes with
      them, and the window reloads into the setup. */
  async function resetUserData() {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const sure = await confirm(
      "Bookmarks, recent pages, and every setting are removed. This cannot be undone.",
      { title: "Reset user data", kind: "warning", okLabel: "Reset" },
    );
    if (!sure) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await invoke("reset_user_data");
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("houdinimd.")) localStorage.removeItem(key);
      }
      window.location.reload();
    } catch (reason) {
      showToast(String(reason), "error");
      setBusy(false);
    }
  }

  return (
    <div
      role="menu"
      style={{ top: at.y, left: at.x }}
      onMouseDown={(event) => event.stopPropagation()}
      className={cn(
        "fixed z-50 w-[200px] overflow-hidden rounded-lg border border-hairline",
        "bg-raised p-1 shadow-xl shadow-black/10",
      )}
    >
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={telemetry === true}
        disabled={telemetry === null}
        className={cn(ITEM, "justify-between")}
        onClick={() => void toggleTelemetry()}
      >
        Send usage data
        {telemetry && <Icons.chosen className="size-[14px] text-neutral-600" />}
      </button>
      <button
        type="button"
        role="menuitem"
        className={ITEM}
        onClick={() => {
          void invoke("show_telemetry_log").catch((reason) => showToast(String(reason), "error"));
          onClose();
        }}
      >
        See what is sent
      </button>
      <div role="separator" className="mx-sm my-1 h-px bg-hairline" />
      <button type="button" role="menuitem" disabled={busy} className={ITEM} onClick={resetIndex}>
        Reset index
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        className={cn(ITEM, "text-destructive")}
        onClick={() => void resetUserData()}
      >
        Reset user data
      </button>
    </div>
  );
}
