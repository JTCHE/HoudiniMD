"use client";

import type { Pointer } from "@/components/landing/showcase/driver";
import { reach } from "@/lib/landing/spring";
import { cn } from "@/lib/utils";

/** Keyframes per move. The easing is in their places, and the timing between
    them is linear: the one form every engine runs on its compositor, so a
    page the app draws on the main thread does not stop the pointer. */
const FRAMES = 60;

type Point = { x: number; y: number };

/** Where the app sits in the frame, in page pixels: the app's point `p` is
    drawn at `x + k·p.x`, `y + k·p.y`. */
export type Place = { x: number; y: number; k: number };

/** The cursor lives in page pixels, outside the frame's `zoom`: Firefox draws
    a transform animated under `zoom` at the wrong place, and snaps it right
    when the move ends. The driver's points are the app's, so they are placed
    here, and the arrow is scaled with the app. */
const at = (p: Point, { x, y, k }: Place) => `translate(${x + k * p.x}px, ${y + k * p.y}px) scale(${k})`;

/** Where the cursor waits before its first move, in the app's pixels. */
const START = { x: 600, y: 420 };

/** The shapes the cursor takes, each drawn on a 24px box with its hot spot:
    the point that sits on the spot the driver names. Dark with a light rim,
    so it reads on a light page and on a dark one. */
const SHAPES = {
  arrow: {
    at: [4, 4],
    body: <path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z" />,
  },
  zoom: {
    at: [10.5, 10.5],
    body: (
      <>
        <path
          d="m16 16 5 5"
          strokeWidth={5}
        />
        <path
          d="m16 16 5 5"
          stroke="#111"
          strokeWidth={2.5}
        />
        <circle
          cx={10.5}
          cy={10.5}
          r={7.5}
        />
        <path
          d="M10.5 7.25v6.5M7.25 10.5h6.5"
          fill="none"
        />
      </>
    ),
  },
} as const;
type Shape = keyof typeof SHAPES;

/** The app's own cursor over a spot, as one of `SHAPES`. */
const LOOKS: Record<string, Shape> = { "zoom-in": "zoom" };

/** The cursor the driver moves over the app. */
export function Cursor({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-look="arrow"
      // Its own layer from the start: a layer made mid-move costs a frame.
      className="group pointer-events-none absolute top-0 left-0 z-10 origin-top-left opacity-0 transition-opacity duration-150 will-change-transform"
    >
      {/* The press shrinks the shape, not the node that moves: a scale there
          would pull the hot spot toward the frame's corner. */}
      <span className="absolute top-0 left-0 origin-top-left transition-[scale] duration-150">
        {(Object.keys(SHAPES) as Shape[]).map((shape) => (
          <svg
            key={shape}
            data-shape={shape}
            viewBox="0 0 24 24"
            className={cn(
              "absolute size-6 scale-75 opacity-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-[opacity,scale] duration-100",
              "group-data-[look=arrow]:data-[shape=arrow]:scale-100 group-data-[look=arrow]:data-[shape=arrow]:opacity-100",
              "group-data-[look=zoom]:data-[shape=zoom]:scale-100 group-data-[look=zoom]:data-[shape=zoom]:opacity-100",
            )}
            style={{ left: -SHAPES[shape].at[0], top: -SHAPES[shape].at[1], transformOrigin: `${SHAPES[shape].at[0]}px ${SHAPES[shape].at[1]}px` }}
            fill="#111"
            stroke="white"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {SHAPES[shape].body}
          </svg>
        ))}
      </span>
    </div>
  );
}

/** The driver's hand on `Cursor`, and the tour's hold on it: a held hand
    stops where it is and hides, for the reader's own pointer or a pause. */
export function cursorPointer(
  cursor: React.RefObject<HTMLDivElement | null>,
  place: React.RefObject<Place>,
): Pointer & { hold(on: boolean): void } {
  // Only the last move is cut: the fade and the press are CSS transitions on
  // the same node, and cutting them snaps the cursor in or out.
  let last: Animation | undefined;
  // Where the cursor is, kept here and never read back from its style: under
  // the frame's `zoom`, Firefox gives the computed transform scaled by it, and
  // each move then started from a point nearer the corner.
  let rest = START;
  let path: (t: number) => Point = () => rest;
  let span = 0;
  let shown = false;
  let held = false;
  const where = () => {
    const time = Number(last?.currentTime ?? span);
    return last && last.playState !== "finished" ? path(reach(Math.min(1, time / span))) : rest;
  };
  const paint = () => {
    const node = cursor.current;
    if (!node) return;
    const visible = shown && !held;
    // Placed again as it shows: the app may have moved in the frame since.
    if (visible && last?.playState !== "running") node.style.transform = at(where(), place.current);
    node.style.opacity = visible ? "1" : "0";
    if (!visible) node.dataset.look = "arrow";
  };
  return {
    // A hand moves in an arc, not a line: the path bends to one side, by up
    // to a fifth of its length, through a control point off its middle.
    move(x, y, ms) {
      const node = cursor.current;
      if (!node) return;
      // From where it is drawn now, even mid-move: a move can cut into the
      // one before.
      const from = where();
      last?.cancel();
      const bend = (Math.random() < 0.5 ? -1 : 1) * (0.08 + Math.random() * 0.12);
      const control = { x: (from.x + x) / 2 - (y - from.y) * bend, y: (from.y + y) / 2 + (x - from.x) * bend };
      path = (t) => {
        const u = 1 - t;
        return { x: u * u * from.x + 2 * u * t * control.x + t * t * x, y: u * u * from.y + 2 * u * t * control.y + t * t * y };
      };
      span = ms;
      rest = { x, y };
      const frames = Array.from({ length: FRAMES + 1 }, (_, i) => ({ transform: at(path(reach(i / FRAMES)), place.current) }));
      node.style.transform = at(rest, place.current);
      last = node.animate(frames, { duration: ms, easing: "linear" });
      if (held) last.pause();
    },
    where,
    look(css) {
      if (cursor.current) cursor.current.dataset.look = LOOKS[css] ?? "arrow";
    },
    press(down) {
      const shape = cursor.current?.firstElementChild as HTMLElement | null | undefined;
      if (shape) shape.style.scale = down ? "0.85" : "1";
    },
    show(visible) {
      shown = visible;
      paint();
    },
    hold(on) {
      held = on;
      if (on) last?.pause();
      else if (last?.playState === "paused") last.play();
      paint();
    },
  };
}
