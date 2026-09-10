import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";
import { invoke } from "@/lib/backend";
import { pickInstall, type Install } from "@/lib/install";

/** Every row of the list, so the folder row cannot drift from the builds. */
const ROW =
  "flex w-full cursor-interactive items-center gap-sm rounded-lg border px-ms py-md text-left " +
  "transition-colors duration-(--duration-fast) motion-reduce:transition-none " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

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
    <div className="-mx-ms flex flex-col gap-sm">
      {installs.map((install) => {
        const chosen = install.version === value;
        return (
          <button
            key={install.root}
            type="button"
            aria-pressed={chosen}
            onClick={() => onChange(install.version)}
            onMouseDown={(event) => event.preventDefault()}
            className={cn(
              ROW,
              "bg-neutral-50 pointer-hover:bg-neutral-100",
              chosen ? "border-neutral-200 shadow-chip" : "border-hairline",
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "truncate text-[15px] leading-[1.52] font-medium",
                  chosen ? "text-brand-700" : "text-neutral-700",
                )}
              >
                Houdini {install.version}
              </span>
              <span className="truncate text-caption text-neutral-400">{install.root}</span>
            </span>
            {chosen && <Icons.chosen className="size-md shrink-0 text-brand-700" />}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => void browse()}
        onMouseDown={(event) => event.preventDefault()}
        className={cn(ROW, "border-hairline bg-neutral-50 pointer-hover:bg-neutral-100")}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] leading-[1.52] font-medium text-neutral-700">
            Pick a folder…
          </span>
          <span className="truncate text-caption text-neutral-400">
            {picking ? "Reading…" : "Elsewhere on this machine"}
          </span>
        </span>
      </button>
    </div>
  );
}
