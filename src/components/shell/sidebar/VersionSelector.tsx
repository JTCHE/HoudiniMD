/**
 * Which Houdini the app is reading.
 *
 * The whole promise of the app is that the docs match the install, so the
 * build is the first thing in the panel and it is named in full.
 *
 * Picking a different install is the next step and is not wired yet — see the
 * spec "Local — Multiple Houdini Versions". The card keeps the shape it will
 * have then, chevron and all, and is DISABLED until it can do the thing it
 * looks like it does. A control that draws itself as pressable and answers a
 * press with nothing is worse than one that says it cannot.
 */
import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";

interface VersionSelectorProps {
  /** `null` while the install is still being read. */
  version: string | null;
  pageCount: number | null;
  className?: string;
}

export function VersionSelector({ version, pageCount, className }: VersionSelectorProps) {
  return (
    <button
      type="button"
      disabled
      title="One install on this machine — picking another is not wired yet"
      className={cn(
        "flex h-[46px] w-full items-center justify-between rounded-lg px-ms text-left",
        "border border-hairline bg-raised shadow-chip",
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
