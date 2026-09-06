/**
 * Minimize, maximize and close, drawn by the app.
 *
 * The window has no system frame (`decorations: false` in `tauri.conf.json`),
 * which is what puts the title bar and these buttons on one row instead of two.
 * The price is that the OS no longer draws them, so the shapes, the hit
 * targets and the close button's red hover are stated here — at the sizes
 * Windows uses, so they read as the window's own buttons and not as three more
 * controls inside the page.
 */
import { useEffect, useState } from "react";
import { appWindow } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";

/* Windows' own caption button: a wide, short target with no radius, reaching
   the full height of the bar so the pointer catches it at the screen corner. */
const CAPTION_BUTTON =
  "grid h-full w-caption-w shrink-0 cursor-pointer place-items-center text-neutral-700 " +
  "transition-colors duration-(--duration-fast) motion-reduce:transition-none " +
  "pointer-hover:bg-neutral-200 active:bg-neutral-300 " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:-ring-offset-2";

export function WindowControls({ className }: { className?: string }) {
  const [maximized, setMaximized] = useState(false);

  // Houdini's help pane owns its own frame. Drawing these there gives the
  // reader three buttons that do nothing.
  const shown = appWindow() !== null;

  // The window can be maximized without these buttons — a double-click on the
  // bar, the Win+Up shortcut, a snap gesture — so the glyph follows the
  // window's own state rather than what was last clicked here.
  useEffect(() => {
    const shell = appWindow();
    if (!shell) return;
    let live = true;
    const sync = () => {
      void shell
        .isMaximized()
        .then((is) => {
          if (live) setMaximized(is);
        })
        // Outside a Tauri window — the browser harness — there is no window to
        // ask. The buttons still draw, and the glyph stays on "maximize".
        .catch(() => {});
    };
    sync();
    const stop = shell.onResized(sync).catch(() => () => {});
    return () => {
      live = false;
      void stop.then((unlisten) => unlisten());
    };
  }, []);

  const MaximizeGlyph = maximized ? Icons.captionRestore : Icons.captionMaximize;

  if (!shown) return null;

  return (
    <div className={cn("flex h-full items-center", className)}>
      <button
        type="button"
        aria-label="Minimize"
        className={CAPTION_BUTTON}
        onClick={(() => void appWindow()?.minimize())}
      >
        <Icons.captionMinimize className="size-[11px]" />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        className={CAPTION_BUTTON}
        onClick={(() => void appWindow()?.toggleMaximize())}
      >
        <MaximizeGlyph className="size-[11px]" />
      </button>
      <button
        type="button"
        aria-label="Close"
        className={cn(
          CAPTION_BUTTON,
          // The one coloured control in the chrome, and the platform's own
          // convention: red fill, white glyph, in both themes.
          "pointer-hover:bg-window-close pointer-hover:text-white active:bg-window-close/85",
        )}
        onClick={(() => void appWindow()?.close())}
      >
        <Icons.captionClose className="size-[11px]" />
      </button>
    </div>
  );
}
