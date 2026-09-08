/**
 * Which Houdini the app is reading.
 *
 * The whole promise of the app is that the docs match the install, so the
 * build is the first thing in the panel and it is named in full.
 *
 * In the desktop window this is a picker: every install on the machine, one
 * row each, naming its build and how much of it is indexed. In Houdini's help
 * pane it stays a label — which Houdini pressed F1 decides the build there,
 * so a switcher would be a lie. `inTauri` is what tells the two apart. See
 * spec: Local — Multiple Houdini Versions, Local — What the help pane shows.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";
import { invoke, inTauri } from "@/lib/backend";
import { announceBuildChanged, pickInstall } from "@/lib/install";
import { showToast } from "@/components/ui/toast-notification";

interface VersionSelectorProps {
  /** `null` while the install is still being read. */
  version: string | null;
  pageCount: number | null;
  className?: string;
}

/** One row of the picker: a build and how much of it is indexed. */
interface BuildRow {
  version: string;
  pages: number;
  done: boolean;
  /** False for a build nobody has opened. Its index is empty because no pass
      has run, not because a pass is running. */
  started: boolean;
  current: boolean;
}

/** What the right of a row says about a build. Three states, not two: a build
    with no pages has either never been opened or is being read right now, and
    saying "indexing…" for the first is a lie the reader can see through. */
/** Every row of the popover, so the folder row cannot drift from the builds. */
const ROW =
  "flex w-full cursor-interactive items-center justify-between gap-sm rounded-md px-sm py-[7px] text-left text-[13px] " +
  "transition-colors duration-(--duration-fast) motion-reduce:transition-none disabled:cursor-default " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Stands for the folder row in `switching`, which otherwise holds a build. */
const PICK = "\0pick";

function indexState(row: BuildRow, switching: boolean): string {
  if (switching) return "Switching…";
  if (row.done) return `${row.pages.toLocaleString()} pages`;
  if (!row.started) return "Not indexed yet";
  return `${row.pages.toLocaleString()} pages, indexing…`;
}

export function VersionSelector({ version, pageCount, className }: VersionSelectorProps) {
  if (!inTauri) {
    return <Card version={version} pageCount={pageCount} className={className} />;
  }
  return <Picker version={version} pageCount={pageCount} className={className} />;
}

/** The card alone, as a label. What the help pane shows, and what the picker
    below draws itself as before it is opened. */
function Card({
  version,
  pageCount,
  className,
  onClick,
  expanded,
}: VersionSelectorProps & { onClick?: () => void; expanded?: boolean }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      aria-haspopup={onClick ? "listbox" : undefined}
      aria-expanded={onClick ? expanded : undefined}
      title={onClick ? "Read the docs for a different Houdini" : "Which Houdini pressed F1 decides this"}
      onClick={onClick}
      className={cn(
        "flex h-[46px] w-full items-center justify-between rounded-lg px-ms text-left",
        "border border-hairline bg-raised shadow-chip",
        onClick && "cursor-interactive pointer-hover:bg-neutral-100",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium tracking-[-0.012em] text-neutral-950">
          {version ? `Houdini ${version}` : "No Houdini install found"}
        </span>
        <span className="truncate text-caption text-neutral-500">
          {pageCount === null ? "Reading the install…" : `${pageCount.toLocaleString()} pages`}
        </span>
      </span>
      <Icons.versionPicker className="size-ms shrink-0 text-neutral-500" />
    </button>
  );
}

/** The card, plus the popover it opens: every install on the machine. */
function Picker({ version, pageCount, className }: VersionSelectorProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BuildRow[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  // A rescan is the picker's own cost to pay, not every page's — see
  // spec: Local — Multiple Houdini Versions.
  useEffect(() => {
    if (!open) return;
    setRows(null);
    void invoke<BuildRow[]>("available_installs")
      .catch(() => [])
      .then(setRows);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(row: BuildRow) {
    if (row.current) {
      setOpen(false);
      return;
    }
    setSwitching(row.version);
    try {
      await invoke("select_install", { version: row.version });
      announceBuildChanged();
    } finally {
      setSwitching(null);
      setOpen(false);
    }
  }

  async function browse() {
    setSwitching(PICK);
    try {
      if (await pickInstall()) setOpen(false);
    } catch (reason) {
      showToast(String(reason), "error");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div ref={wrapper} className={cn("relative", className)}>
      <Card
        version={version}
        pageCount={pageCount}
        onClick={() => setOpen((v) => !v)}
        expanded={open}
      />
      <div
        role="listbox"
        aria-label="Houdini installs on this machine"
        className={cn(
          "absolute left-0 top-full z-10 mt-1 w-full origin-top overflow-hidden rounded-lg",
          "border border-hairline bg-raised p-1 shadow-xl shadow-black/10",
          "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
          open ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-[0.98]",
        )}
      >
        {rows === null ? (
          <p className="px-sm py-sm text-caption text-neutral-500">Looking for Houdini…</p>
        ) : (
          <>
            {rows.length === 0 && (
              <p className="px-sm py-sm text-caption text-neutral-500">No Houdini install found.</p>
            )}
            {rows.map((row) => (
              <button
                key={row.version}
                type="button"
                role="option"
                aria-selected={row.current}
                disabled={switching !== null}
                onClick={() => void pick(row)}
                className={cn(ROW, row.current ? "text-brand" : "text-neutral-800 pointer-hover:bg-neutral-100")}
              >
                <span className="truncate font-medium tracking-[-0.012em]">Houdini {row.version}</span>
                <span className="shrink-0 text-caption text-neutral-500">
                  {indexState(row, switching === row.version)}
                </span>
              </button>
            ))}
            {/* An install outside Program Files is invisible to the scan, and a
                studio puts its builds wherever it likes. Onboarding asks with
                the same call — see `pickInstall`. */}
            <button
              type="button"
              role="option"
              aria-selected={false}
              disabled={switching !== null}
              onClick={() => void browse()}
              className={cn(ROW, "text-neutral-800 pointer-hover:bg-neutral-100")}
            >
              <span className="truncate font-medium tracking-[-0.012em]">Pick a folder…</span>
              <span className="shrink-0 text-caption text-neutral-500">
                {switching === PICK ? "Reading…" : "Elsewhere on this machine"}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
