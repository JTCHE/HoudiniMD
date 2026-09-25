/**
 * The page header's controls: copy, bookmark, pictures, launch, and the link
 * from an example to its node. One height, one padding, one type size, so a
 * row of them reads as one set whether a control is quiet or primary.
 */
export const ACTION = "flex h-8 shrink-0 cursor-interactive items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium";

/** The quiet look most of them take. The primary one is `PrimaryButton`. */
export const QUIET =
  "border border-input bg-muted/50 text-muted-foreground shadow-xs transition-colors " +
  "hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export const ACTION_ICON = "size-3.5 shrink-0";
