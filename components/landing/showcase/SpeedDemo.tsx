"use client";

import { Gauge } from "lucide-react";
import { enter, usePlayed, type DemoProps } from "@/components/landing/showcase/layout";
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

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];
/** Every number in the headline comes from the rows. */
const SERVER = median(ROWS.map((r) => r.server));
const APP = median(ROWS.map((r) => r.app));
const FASTER = median(ROWS.map((r) => r.server / r.app));
/** A phone has room for three rows. */
const PHONE_ROWS = 3;

/** A time, its unit in the number's own colour, faded. */
const seconds = (value: number) => (
  <>
    {value.toFixed(2)}
    <span className="opacity-50">s</span>
  </>
);

/** The race's lanes, top to bottom. Each runs its whole course before the
    next starts, so the order here is the order of the race. */
const LANES = [
  { label: SITE_NAME, time: APP, brand: true },
  { label: "Houdini's help", time: SERVER, brand: false },
];
/** A lane's run, in seconds from the start of the race: a longer time takes
    longer to draw, and the next lane waits a beat after it. */
const RUNS = LANES.reduce<{ from: number; for: number }[]>((runs, lane) => {
  const last = runs.at(-1);
  return [...runs, { from: last ? last.from + last.for + 0.3 : 0, for: 0.8 + (0.6 * lane.time) / SERVER }];
}, []);
/** The race waits for the lanes to come in, in ms. */
const START = 700;
const END = Math.max(...RUNS.map((run) => run.from + run.for));
/** The race clock, in seconds, from the tab's clock. */
const raceTime = (ms: number) => Math.min(END, Math.max(0, ms - START) / 1000);

/** Fast from the first frame and slow to rest: a count leaves 0 at once, and
    the bar and the count share it, so the number is always the bar's. */
const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 4;

/** One side of the race: a pill that fills, its time counting at its end. */
function Lane({
  label,
  time,
  now,
  run,
  order,
  brand,
}: {
  label: string;
  time: number;
  now: number;
  run: { from: number; for: number };
  order: number;
  brand?: boolean;
}) {
  const reach = easeOut((now - run.from) / run.for);
  return (
    <div
      style={enter(order)}
      className="enter grid grid-cols-[150px_1fr] items-center gap-4 max-sm:grid-cols-[110px_1fr] max-sm:gap-3"
    >
      <span className={cn("text-[15px]", brand ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
      <div
        className="relative h-9 max-sm:h-6"
        // The pill's full length. The time needs about 64px past the longest
        // one. The least is a short pill, not a dot, and no longer than it
        // must be: a longer one would tell a smaller lead.
        style={{ "--bar": `max(36px, calc((100% - 76px) * ${time / SERVER}))` } as React.CSSProperties}
      >
        {/* The pill at its full length is the mask, and draws nothing. The
            fill inside starts a whole pill left of it, and its round end
            comes in through the mask's round end: it grows, with no pop. */}
        <div className="h-full w-(--bar) overflow-hidden rounded-full">
          <div
            className={cn("-ml-[100%] h-full rounded-full", brand ? "bg-brand" : "bg-foreground/15")}
            style={{ width: `${100 * (1 + reach)}%` }}
          />
        </div>
        {/* Nothing before its turn: a time of 0 tells nothing. */}
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-[15px] tabular-nums transition-opacity duration-(--duration-fast)",
            brand ? "font-medium text-brand-700 dark:text-brand-bright" : "text-foreground",
            reach <= 0 && "opacity-0",
          )}
          style={{ left: `calc(var(--bar) * ${reach} + 12px)` }}
        >
          {seconds(time * reach)}
        </span>
      </div>
    </div>
  );
}

export function SpeedDemo({ base, clock }: DemoProps) {
  const { phone } = base;
  // A short window packs the parts closer, so the whole table fits.
  const short = !phone && base.h < 680;
  const rows = phone ? ROWS.slice(0, PHONE_ROWS) : ROWS;
  const played = usePlayed(clock, raceTime);
  // Less motion: the race as it ends.
  const now = matchMedia("(prefers-reduced-motion: reduce)").matches ? END : played;

  return (
    <div className={cn("flex h-full flex-col", phone ? "gap-5 px-5 py-6" : short ? "gap-6 px-14 py-8" : "gap-9 px-14 py-12")}>
      <div
        style={enter(0)}
        className="enter"
      >
        <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
            <Gauge
              className="size-4"
              strokeWidth={1.5}
            />
            F1 in Houdini&apos;s help pane
          </p>
          <p className={cn("mt-3 max-w-[720px] leading-snug tracking-tight text-muted-foreground", phone ? "text-[21px]" : "text-[30px]")}>
            <span className="font-semibold text-foreground">{FASTER.toFixed(1)}× faster</span>{" "}
            than Houdini&apos;s own help server.
          </p>
      </div>

      <div className="flex flex-col gap-3">
        {LANES.map((lane, i) => (
          <Lane
            key={lane.label}
            {...lane}
            now={now}
            run={RUNS[i]}
            order={i + 1}
          />
        ))}
      </div>

      <table
        style={enter(3)}
        className="enter w-full border-collapse text-[15px] tabular-nums">
        <thead>
          <tr className="border-b border-hairline text-left text-[13px] text-muted-foreground">
            <th className="py-2 font-normal">Page</th>
            <th className="py-2 text-right font-normal">Houdini&apos;s help</th>
            <th className="py-2 text-right font-normal">{SITE_NAME}</th>
            {!phone && <th className="py-2 text-right font-normal">Faster</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.page}
              className="border-b border-hairline/60 transition-colors last:border-0 hover:bg-foreground/[0.03]"
            >
              <td className="py-2 text-foreground">{r.page}</td>
              <td className="py-2 text-right text-muted-foreground">{seconds(r.server)}</td>
              <td className="py-2 text-right font-medium text-brand-700 dark:text-brand-bright">{seconds(r.app)}</td>
              {!phone && <td className="py-2 text-right text-foreground">{(r.server / r.app).toFixed(1)}×</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <p
        style={enter(4)}
        className="enter mt-auto text-[12px] text-muted-foreground">
        Median of 5 presses of F1. Houdini 22.0.368. Measured on 1 machine.
      </p>
    </div>
  );
}
