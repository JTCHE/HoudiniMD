import { Keycap } from "@/components/root/feature-cards/Keycap";

/** Houdini's help pane, peeking in from the top of the card. It is taller than
    the frame on purpose, so the card cuts it off and it reads as a real window
    that continues below. `self-start` keeps the cut at the bottom edge. */
export function HelpPane() {
  return (
    <div
      aria-hidden
      className="self-start w-full px-md pt-md select-none pointer-events-none"
    >
      <div className="relative">
        <div className="bg-surface border border-hairline rounded-lg shadow-pane overflow-hidden">
          <div className="flex items-center gap-sm px-sm py-xs bg-muted">
            <div className="flex items-center gap-xs shrink-0">
              <span className="size-sm rounded-full bg-neutral-300" />
              <span className="size-sm rounded-full bg-neutral-300" />
              <span className="size-sm rounded-full bg-neutral-300" />
            </div>
            <p className="text-caption text-muted-foreground truncate">Help | Karma</p>
          </div>
          <div className="flex flex-col gap-sm p-sm">
            <div className="h-sm w-1/2 rounded-full bg-neutral-300" />
            <div className="h-xs w-full rounded-full bg-neutral-200" />
            <div className="h-xs w-5/6 rounded-full bg-neutral-200" />
            <div className="h-xl w-full rounded-md bg-neutral-200" />
            <div className="h-xs w-full rounded-full bg-neutral-200" />
            <div className="h-xs w-2/3 rounded-full bg-neutral-200" />
          </div>
        </div>
        <Keycap className="absolute -top-sm -right-sm">F1</Keycap>
      </div>
    </div>
  );
}
