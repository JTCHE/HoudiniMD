/**
 * The window's own bar: what the app is, where the reader has been, and the
 * three buttons that own the window.
 *
 * The bar IS the drag region — `data-tauri-drag-region` on the row, so any
 * gap between the controls moves the window, the way a system title bar does.
 * Every control inside it stops that: a button that also dragged the window
 * would swallow the click.
 */
import { Link, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useTrail } from "@/lib/nav";
import { WindowControls } from "./WindowControls";

/* A square icon button on the bar. Smaller than a caption button and rounded,
   because it belongs to the app rather than to the window. */
const BAR_BUTTON =
  "grid size-[28px] shrink-0 cursor-interactive place-items-center rounded-md text-neutral-700 " +
  "transition-colors duration-(--duration-fast) motion-reduce:transition-none " +
  "pointer-hover:not-disabled:bg-neutral-200 active:not-disabled:bg-neutral-300 " +
  "disabled:text-neutral-400 disabled:pointer-events-none " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

interface TitleBarProps {
  /** Whether the sidebar is open, and how to change that. */
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** True on a doc page. The landing page shows the arrows only once there
      is a trail to walk — on the first launch there is none, and two dead
      arrows on an empty window say nothing. */
  showTrail: boolean;
}

export function TitleBar({ sidebarOpen, onToggleSidebar, showTrail }: TitleBarProps) {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useTrail();
  const showArrows = showTrail || canGoBack || canGoForward;

  return (
    <header
      data-tauri-drag-region
      className={cn(
        // No gap on the row itself: the caption buttons have to reach the
        // window's right edge, and a row gap would leave a strip of bar
        // beside the close button that no click can ever hit.
        "flex h-titlebar shrink-0 items-center pl-sm",
        // The hairline is drawn INSIDE the bar. A border would take a pixel
        // off the row, and the caption buttons would stop a pixel short of
        // the bottom of the window's own bar.
        "shadow-[inset_0_-1px_0_var(--hairline)] bg-neutral-50 select-none",
      )}
    >
      <button
        type="button"
        aria-label={sidebarOpen ? "Hide the sidebar" : "Show the sidebar"}
        aria-pressed={sidebarOpen}
        className={BAR_BUTTON}
        onClick={(onToggleSidebar)}
      >
        <Icons.sidebarToggle className="size-4" />
      </button>

      {/* The name is the way home, the way a window title is in every app
          that has a home to go to. */}
      <Link
        to="/"
        className={cn(
          // Same plate as BAR_BUTTON: 28px tall, same radius, same hover fill.
          // Only the horizontal padding differs, because a logo and a word
          // need more room than one glyph.
          "ml-sm flex h-[28px] shrink-0 cursor-interactive items-center gap-[6px] rounded-md px-sm",
          "transition-colors duration-(--duration-fast) motion-reduce:transition-none",
          "pointer-hover:bg-neutral-200",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        <BrandLogo className="h-[16px] w-auto" />
        <span className="translate-y-[0.5px] text-[12.5px] font-medium tracking-[-0.01em] text-neutral-950">
          HoudiniMD
        </span>
      </Link>

      {/* The arrows say where the trail leads before they are pressed: a
          disabled arrow is the honest answer to "is there a page behind this
          one", and it never moves, so the bar does not reflow as the reader
          walks. They are absent on the landing page, which has no trail. */}
      {showArrows && (
        <span className="ml-sm flex shrink-0 items-center gap-2xs">
          <button
            type="button"
            aria-label="Back"
            disabled={!canGoBack}
            className={BAR_BUTTON}
            onClick={(() => void navigate(-1))}
          >
            <Icons.back className="size-[15px]" />
          </button>
          <button
            type="button"
            aria-label="Forward"
            disabled={!canGoForward}
            className={BAR_BUTTON}
            onClick={(() => void navigate(1))}
          >
            <Icons.forward className="size-[15px]" />
          </button>
        </span>
      )}

      {/* The stretch between the app's controls and the window's is the part of
          the bar a reader grabs to move the window. */}
      <span
        data-tauri-drag-region
        className="h-full flex-1"
      />

      <WindowControls />
    </header>
  );
}
