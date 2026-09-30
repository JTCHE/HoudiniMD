"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { DemoProps } from "@/components/landing/showcase/Showcase";
import { SITE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * F1 to a readable page in Houdini's help pane, median of 5 presses, Houdini
 * 22.0.368, the same machine. The run behind the README's help-server chart.
 */
const ROWS = [
  { page: "Box", server: 1.63, app: 0.12 },
  { page: "Attribute Wrangle", server: 1.68, app: 0.13 },
  { page: "Pyro Solver", server: 4.22, app: 0.13 },
  { page: "VEX noise()", server: 0.96, app: 0.12 },
  { page: "FLIP Tank tool", server: 1.46, app: 0.19 },
];
/** The headline: the median of the rows' own ratios, so it is the rows' claim. */
const MEDIAN = ROWS.map((r) => r.server / r.app).sort((a, b) => a - b)[ROWS.length >> 1];
/** A phone has room for three rows. */
const PHONE_ROWS = 3;
/** Seconds the widest bar stands for. */
const SPAN = 4.4;
/** A character of the 15px mono face, and the room a row keeps for its label,
    its time and its padding, in the tab's pixels. */
const CELL = 9.2;
const AROUND = { desk: 400, phone: 110 };
const NOISE = "+×*:=#%";

/** A bar drawn in characters: settled cells, and a live edge of noise while
    it grows. */
function bar(seconds: number, now: number, fill: string, width: number) {
  const done = Math.min(seconds, now);
  const cells = Math.max(1, Math.round((done / SPAN) * width));
  const growing = now < seconds;
  let out = fill.repeat(Math.max(0, cells - (growing ? 3 : 0)));
  if (growing) for (let i = 0; i < 3; i++) out += NOISE[(Math.random() * NOISE.length) | 0];
  return out;
}

export function SpeedDemo({ base }: DemoProps) {
  const { phone } = base;
  // A short window packs the rows closer, so all five fit.
  const short = !phone && base.h < 680;
  const width = Math.floor((base.w - (phone ? AROUND.phone : AROUND.desk)) / CELL);
  const rows = phone ? ROWS.slice(0, PHONE_ROWS) : ROWS;
  // The race clock, in seconds since the press.
  const [now, setNow] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [run, setRun] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNow(SPAN);
      return;
    }
    setNow(0);
    let frame = 0;
    const tick = (time: number) => {
      started.current ||= time;
      const seconds = (time - started.current) / 1000;
      setNow(seconds);
      if (seconds < SPAN) frame = requestAnimationFrame(tick);
    };
    const delay = setTimeout(() => (frame = requestAnimationFrame(tick)), 400);
    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(frame);
      started.current = 0;
    };
  }, [run]);

  const row = hover === null ? null : ROWS[hover];

  return (
    <div className={cn("flex h-full flex-col", phone ? "px-6 pt-5 pb-4" : short ? "px-16 pt-9 pb-6" : "px-16 pt-14 pb-10")}>
      <div className={cn("flex justify-between", phone ? "flex-col gap-5" : "items-end gap-10")}>
        <div>
          <p className="font-mono text-[13px] tracking-wide text-muted-foreground uppercase">[ F1 → a page you can read ]</p>
          <h3 className={cn("mt-4 leading-none font-semibold tracking-tight text-foreground", phone ? "text-[30px] leading-tight" : "text-[44px]")}>
            <span className="text-brand tabular-nums">{(row ? row.server / row.app : MEDIAN).toFixed(1)}×</span>{" "}
            faster than Houdini&apos;s own help
          </h3>
          <p className="mt-3 text-[16px] text-muted-foreground">
            {row
              ? `${row.page}: ${row.server.toFixed(2)} s against ${row.app.toFixed(2)} s.`
              : `Houdini's help pane, pointed at ${SITE_NAME} instead of its own help server.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="group flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-full border border-hairline px-4 py-2 text-[14px] text-muted-foreground transition-colors pointer-hover:text-foreground"
        >
          <RotateCcw className="size-3.5 transition-transform duration-300 group-hover:-rotate-90" />
          Replay
        </button>
      </div>

      <div
        className={cn("flex flex-col", phone ? "mt-3 gap-0" : short ? "mt-5 gap-0.5" : "mt-12 gap-2")}
        onPointerLeave={() => setHover(null)}
      >
        {rows.map((r, i) => (
          <div
            key={r.page}
            onPointerEnter={() => setHover(i)}
            className={cn(
              "grid cursor-default items-start rounded-lg transition-[background-color,opacity]",
              phone ? "gap-1 px-2 py-2" : cn("grid-cols-[180px_1fr] gap-6 px-4", short ? "py-1.5" : "py-3"),
              hover === i && "bg-foreground/[0.04]",
              hover !== null && hover !== i && "opacity-40",
            )}
          >
            <span className="text-[16px] leading-[22px] font-medium text-foreground">{r.page}</span>
            <div className="flex flex-col gap-1 font-mono text-[15px] leading-[22px] whitespace-pre">
              <div className="flex gap-3">
                <span className="text-muted-foreground">{bar(r.server, now, "=", width)}</span>
                <span className="text-muted-foreground tabular-nums">{Math.min(r.server, now).toFixed(2)} s</span>
              </div>
              <div className="flex gap-3">
                <span className="text-brand">{bar(r.app, now, "#", width)}</span>
                <span className="font-medium text-brand tabular-nums">{Math.min(r.app, now).toFixed(2)} s</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={cn("mt-auto flex justify-between gap-2 font-mono text-[12px] text-muted-foreground", phone ? "flex-col" : "items-center")}>
        <span className="flex items-center gap-5">
          <span>
            <span>===</span>{" "}Houdini&apos;s help server
          </span>
          <span>
            <span className="text-brand">###</span>{" "}{SITE_NAME}
          </span>
        </span>
        <span>Houdini 22.0.368 · the same machine · median of 5 presses per page</span>
      </div>
    </div>
  );
}
