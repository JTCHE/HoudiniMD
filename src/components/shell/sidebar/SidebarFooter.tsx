/**
 * The bottom of the panel: the trail the reader has left, then the two
 * controls that belong to the app rather than to the documentation.
 *
 * It is pinned to the bottom rather than following the tree, so settings and
 * the theme switch are in the same place whether the tree is open or shut.
 */
import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";
import { toggleTheme, useTheme } from "@/lib/ui/theme";
import { SidebarRow } from "./SidebarRow";

const FOOTER_BUTTON =
  "grid size-[30px] cursor-pointer place-items-center rounded-md text-neutral-500 " +
  "transition-colors duration-(--duration-fast) motion-reduce:transition-none " +
  "pointer-hover:bg-raised pointer-hover:text-neutral-800 " +
  // Disabled changes what it DOES, not how loud it is: the two controls sit
  // side by side and a dimmed one beside a lit one reads as a rendering bug.
  "disabled:cursor-default " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

interface SidebarFooterProps {
  recentCount: number;
  recentsOpen: boolean;
  onToggleRecents: () => void;
  className?: string;
}

export function SidebarFooter({
  recentCount,
  recentsOpen,
  onToggleRecents,
  className,
}: SidebarFooterProps) {
  const theme = useTheme();

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Not a header row: the clock and the word sit on the same axis and at
          the same weight as the pages above them, because Recents is a place
          to go and not a label over a list. */}
      <SidebarRow
        label="Recents"
        mark={<Icons.recent className="size-[15px] translate-y-[0.5px] text-neutral-500" />}
        disclosure={recentsOpen ? "expanded" : "collapsed"}
        active={recentsOpen}
        count={recentCount}
        onClick={onToggleRecents}
      />

      <div className="flex items-center justify-between px-ms pt-ms">
        {/* There is nothing to set yet. The button holds its place — the
            panel's bottom row is stated in the design — and says so by being
            disabled rather than by doing nothing when it is pressed. */}
        <button
          type="button"
          aria-label="Settings"
          title="Settings — nothing to set yet"
          disabled
          className={FOOTER_BUTTON}
        >
          <Icons.settings className="size-[18px]" />
        </button>
        <button
          type="button"
          aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
          className={FOOTER_BUTTON}
          onClick={(toggleTheme)}
        >
          {/* Not one size. A crescent fills less of its box than a sun with
              eight rays around it, so drawn at the same size the moon reads
              as the smaller, lighter icon of the two. */}
          {theme === "dark" ? (
            <Icons.themeDark className="size-[18px]" />
          ) : (
            <Icons.themeLight className="size-[16px]" />
          )}
        </button>
      </div>
    </div>
  );
}
