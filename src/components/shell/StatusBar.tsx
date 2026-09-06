/**
 * The strip along the bottom: the three keys worth knowing, and whatever the
 * app is doing in the background.
 *
 * The keys are stated rather than discovered. A desktop reader who learns
 * ⌘K once never opens the search field with the pointer again, and the row
 * costs nothing — it is the space under the content, which is empty anyway.
 *
 * The right-hand slot is for a running job. It holds the index pass, which is
 * the only thing the app does that the reader did not ask for, and it says
 * nothing once that pass is done.
 */
import { cn } from "@/lib/utils";
import { COMMAND_KEY } from "@/lib/hotkeys";
import { Keycap } from "@/components/ui/Keycap";
import { IndexProgress } from "@/components/root/IndexProgress";
import { inTauri } from "@/lib/backend";

const HINTS: Array<{ keys: string[]; label: string }> = [
  { keys: [COMMAND_KEY, "K"], label: "Search" },
  { keys: [COMMAND_KEY, "C"], label: "Copy as Markdown" },
  { keys: [COMMAND_KEY, "D"], label: "Bookmark" },
];

// The reader who is already in Houdini's help pane got here by pressing it.
if (inTauri) HINTS.push({ keys: ["F1"], label: "Opens this window from Houdini" });

const SMALL_KEY = "rounded-md px-sm py-xs text-caption leading-none";

export function StatusBar({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "flex h-statusbar shrink-0 items-center gap-lg px-lg select-none",
        className,
      )}
    >
      {/* py-xs holds room for the keycap's own shadow (--elevation-keycap
          draws a hard edge below the cap). Without it, this row's box wraps
          the cap with no slack, and overflow-hidden — kept for narrow-window
          truncation — cuts the shadow off flush. The shadow's blur spreads
          sideways too, so px-2xs holds the same room on the left and right,
          and -mx-2xs gives it back: the first cap stays on the same axis. */}
      <div className="-mx-2xs flex min-w-0 items-center gap-md overflow-hidden px-2xs py-xs">
        {HINTS.map((hint) => (
          <span
            key={hint.label}
            className="flex shrink-0 items-center gap-xs"
          >
            {hint.keys.map((key) => (
              <Keycap
                key={key}
                className={SMALL_KEY}
              >
                {key}
              </Keycap>
            ))}
            <span className="ml-2xs text-meta text-neutral-500">{hint.label}</span>
          </span>
        ))}
      </div>

      <div className="ml-auto shrink-0 text-meta text-neutral-500">
        <IndexProgress />
      </div>
    </footer>
  );
}
