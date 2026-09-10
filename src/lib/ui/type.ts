/**
 * Type that more than one screen sets.
 *
 * A step of the type scale belongs in `globals.css`. What lives here is a
 * COMBINATION — a size, a line height and a tracking that two screens have to
 * agree on. `--text-display` cannot carry this one: it grows on a wide window,
 * and this heading is the same 34px in every window the app opens.
 */

/** The biggest heading in the window: the landing greeting, and the title of
    every onboarding step. */
export const DISPLAY_TITLE =
  "text-[34px] leading-[36px] font-semibold tracking-[-0.032em] text-neutral-950";
