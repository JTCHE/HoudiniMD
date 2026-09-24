import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { invoke, inTauri } from "@/lib/backend";
import { showToast } from "@/components/ui/toast-notification";
import { used } from "@/lib/telemetry";

/**
 * Opens an example page's file in a new Houdini, the same as the Launch
 * button in Houdini's own help. A new Houdini, not the open one: the reader's
 * scene is never touched. Drawn only when the install has the file.
 */
export function LaunchExample({ path }: { path: string }) {
  const [has, setHas] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!inTauri || !path.startsWith("examples/")) return;
    let live = true;
    void invoke<boolean>("has_example", { path })
      .then((found) => live && setHas(found))
      .catch(() => {});
    return () => {
      live = false;
      setHas(false);
    };
  }, [path]);

  if (!has) return null;
  return (
    <button
      type="button"
      disabled={starting}
      onClick={() => {
        used("launch-example");
        setStarting(true);
        invoke("launch_example", { path })
          .then(() => showToast("Houdini is starting with the example"))
          .catch((reason) => showToast(String(reason), "error"))
          // Houdini takes its time to show a window. The button waits a moment
          // so a second press does not start a second Houdini.
          .finally(() => setTimeout(() => setStarting(false), 4000));
      }}
      className="flex cursor-interactive items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-60"
    >
      <Play className="size-3.5" aria-hidden="true" />
      Launch in Houdini
    </button>
  );
}
