"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppBox, Base, DemoProps } from "@/components/landing/showcase/Showcase";
import { SITE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The network's height on a phone, where the pane goes under it. */
const PHONE_NETWORK = 150;
const GAP = 6;
const TAB = 32;
const MENU = 36;
/** The help pane on a desk: the width of a pane docked beside the network. */
const PANE = 472;

/** The help pane, in the tab's pixels: the app sits here, as narrow as a
    Houdini pane, and draws itself the way it does in one. */
export function pane(base: Base): AppBox {
  if (base.phone) {
    const y = GAP + PHONE_NETWORK + GAP + TAB;
    return { x: GAP, y, w: base.w - 2 * GAP, h: base.h - y - GAP, window: base.w - 2 * GAP, bar: y - TAB / 2, end: true };
  }
  const x = base.w - PANE - GAP;
  const y = MENU + GAP + TAB;
  return { x, y, w: PANE, h: base.h - y - GAP, window: 520, bar: y - TAB / 2, end: true };
}

/** Nodes in the network, and the page F1 opens for each. `from` is the node
    wired into each input. The chain runs top to bottom; the box, the shape to
    copy, comes in from the side, and only on a desk. */
const NODES = [
  { name: "grid1", type: "Grid", path: "/nodes/sop/grid", from: [] },
  { name: "attribwrangle1", type: "Attribute Wrangle", path: "/nodes/sop/attribwrangle", from: [0] },
  { name: "scatter1", type: "Scatter", path: "/nodes/sop/scatter", from: [1] },
  { name: "copytopoints1", type: "Copy to Points", path: "/nodes/sop/copytopoints", from: [4, 2] },
  { name: "box1", type: "Box", path: "/nodes/sop/box", from: [] },
];
const SCATTER = 2;
const COPY = 3;
/** The node with the display flag: what the viewport shows. */
const DISPLAY = COPY;

/** Where each node sits, in the network's own pixels. The chain spreads down
    the network, and stops short of the words at its foot. */
function layout(phone: boolean, width: number, height: number) {
  if (phone) return NODES.slice(0, 4).map((_, i) => ({ x: 20 + i * 98, y: 36, w: 64, h: 24 }));
  const x = Math.max(230, Math.round(width * 0.35));
  const step = Math.min(118, (height - 210) / 3);
  const y = (i: number) => Math.round(56 + i * step);
  return NODES.map((_, i) =>
    i === 4 ? { x: x - 190, y: y(SCATTER), w: 110, h: 32 } : { x, y: y(i), w: 120, h: 32 },
  );
}

function Tab({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-black/30 bg-[oklch(0.23_0_0)] px-3 text-white/60" style={{ height: TAB }}>
      {children}
    </div>
  );
}

/** A Houdini session, drawn: a network, and the help pane with the app in it.
    F1 on a selected node opens its page there. */
export function F1Demo({ go, base }: DemoProps) {
  const { phone } = base;
  const [selected, setSelected] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const [yours, setYours] = useState(false);
  const network = base.w - PANE - 3 * GAP;
  const spots = layout(phone, network, base.h - MENU - 2 * GAP - TAB);
  const nodes = NODES.slice(0, spots.length);

  const press = useCallback(
    (index: number | null) => {
      if (index === null) return;
      setPressed(true);
      setTimeout(() => setPressed(false), 160);
      go(NODES[index].path, NODES[index].type);
    },
    [go],
  );

  // The tour: the pane opens on the home screen; F1 on one node, then on
  // another, so the page follows the selection.
  useEffect(() => {
    go("/");
    if (yours || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const steps = [
      setTimeout(() => setSelected(SCATTER), 1200),
      setTimeout(() => press(SCATTER), 2200),
      setTimeout(() => setSelected(COPY), 5200),
      setTimeout(() => press(COPY), 6200),
    ];
    return () => steps.forEach(clearTimeout);
    // Once, when the tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The reader's own F1, while this tab is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "F1") return;
      event.preventDefault();
      setYours(true);
      press(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, selected]);

  const key = (
    <button
      type="button"
      onClick={() => {
        setYours(true);
        if (selected === null) setSelected(SCATTER);
        press(selected ?? SCATTER);
      }}
      className={cn(
        "shrink-0 cursor-pointer rounded-lg border border-white/20 bg-white/10 px-4 py-2 font-mono text-[20px] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)] transition-[translate,background-color,box-shadow] duration-100 hover:bg-white/15",
        pressed && "translate-y-0.5 bg-white/25 shadow-[inset_0_-1px_0_rgba(0,0,0,0.35)]",
      )}
    >
      F1
    </button>
  );

  /** A wire from the output of `a` into input `slot` of `b`, as Houdini
      draws it: a soft S between the two dots. */
  const wire = (a: number, b: number, slot: number, inputs: number) => {
    const from = spots[a];
    const to = spots[b];
    if (phone) return `M${from.x + from.w} ${from.y + from.h / 2} L${to.x} ${to.y + to.h / 2}`;
    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h + 4;
    const x2 = to.x + (to.w * (slot + 1)) / (inputs + 1);
    const y2 = to.y - 4;
    const bend = (y2 - y1) / 2;
    return `M${x1} ${y1} C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`;
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-[oklch(0.2_0_0)] text-[13px] text-white/70">
      {!phone && (
        <div
          className="flex shrink-0 items-center gap-5 border-b border-black/40 bg-[oklch(0.24_0_0)] px-4 text-white/55"
          style={{ height: MENU }}
        >
          {["File", "Edit", "Render", "Assets", "Windows", "Help"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}

      <div
        className={cn("relative flex min-h-0 flex-1", phone && "flex-col")}
        style={{ gap: GAP, padding: GAP }}
      >
        <section
          className="relative flex shrink-0 flex-col overflow-hidden rounded-sm bg-[oklch(0.27_0_0)]"
          style={phone ? { height: PHONE_NETWORK } : { width: network }}
        >
          {!phone && (
            <Tab>
              <span className="rounded-t-sm bg-[oklch(0.27_0_0)] px-3 py-1.5 text-white/85">/obj/geo1</span>
              <span>Network View</span>
            </Tab>
          )}
          <div
            className="relative flex-1"
            style={{
              backgroundImage: "radial-gradient(oklch(1 0 0 / 0.08) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
            onPointerDown={() => {
              setYours(true);
              setSelected(null);
            }}
          >
            <svg className="pointer-events-none absolute inset-0 size-full">
              {nodes.flatMap((node, b) =>
                node.from
                  .map((a, slot) => ({ a, slot }))
                  .filter(({ a }) => a < spots.length)
                  .map(({ a, slot }) => (
                    <path
                      key={`${a}-${b}`}
                      d={wire(a, b, slot, node.from.length)}
                      fill="none"
                      stroke="oklch(1 0 0 / 0.4)"
                      strokeWidth={1.5}
                    />
                  )),
              )}
            </svg>
            {nodes.map((node, i) => {
              const spot = spots[i];
              const on = selected === i;
              return (
                <button
                  key={node.name}
                  type="button"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setYours(true);
                    setSelected(i);
                  }}
                  onDoubleClick={() => press(i)}
                  className={cn("group absolute flex cursor-pointer gap-3", phone ? "flex-col items-start gap-1.5" : "items-center")}
                  style={{ left: spot.x, top: spot.y }}
                >
                  <span
                    className={cn(
                      "relative flex rounded-md bg-[oklch(0.5_0_0)] shadow-[0_2px_6px_rgba(0,0,0,0.4)] ring-1 transition-[box-shadow,background-color] duration-150",
                      on ? "bg-[oklch(0.58_0_0)] ring-2 ring-[oklch(0.86_0.16_95)]" : "ring-black/40 group-hover:bg-[oklch(0.56_0_0)]",
                    )}
                    style={{ width: spot.w, height: spot.h }}
                  >
                    {!phone && (
                      <>
                        {node.from.map((_, slot) => (
                          <span
                            key={slot}
                            className="absolute -top-[5px] size-[7px] -translate-x-1/2 rounded-full bg-[oklch(0.72_0_0)] ring-1 ring-black/50"
                            style={{ left: `${((slot + 1) * 100) / (node.from.length + 1)}%` }}
                          />
                        ))}
                        <span className="absolute -bottom-[5px] left-1/2 size-[7px] -translate-x-1/2 rounded-full bg-[oklch(0.72_0_0)] ring-1 ring-black/50" />
                        {/* The display flag, blue on the node the viewport shows. */}
                        <span
                          className={cn(
                            "ml-auto w-3.5 rounded-r-md border-l border-black/30",
                            i === DISPLAY ? "bg-[oklch(0.62_0.14_240)]" : "bg-black/10",
                          )}
                        />
                      </>
                    )}
                  </span>
                  <span className="text-left leading-tight">
                    <span className={cn("block", phone ? "max-w-[80px] truncate text-[12px]" : "text-[14px]", on ? "text-[oklch(0.86_0.16_95)]" : "text-white/85")}>
                      {node.name}
                    </span>
                    {!phone && <span className="block text-[12px] text-white/40">{node.type}</span>}
                  </span>
                </button>
              );
            })}

            {phone ? (
              <div className="absolute right-3 bottom-3">{key}</div>
            ) : (
              <div className="absolute right-6 bottom-6 left-6 flex items-end justify-between gap-6">
                <p className="max-w-[340px] text-[15px] leading-relaxed text-white/60">
                  Press <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[13px] text-white">F1</kbd>{" "}
                  on a node and its page opens in Houdini&apos;s own help pane, from {SITE_NAME}. You set it up once.
                </p>
                {key}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-sm bg-[oklch(0.27_0_0)]">
          <Tab>
            <span className="rounded-t-sm bg-[oklch(0.27_0_0)] px-3 py-1.5 text-white/85">Help Browser</span>
          </Tab>
        </section>
      </div>
    </div>
  );
}
