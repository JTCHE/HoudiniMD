/**
 * SCROLLING, FRAME BY FRAME, ON THE PAGES THAT ARE HARD TO DRAW.
 *
 *   node harness/scroll.mts                    # build, then every page below
 *   node harness/scroll.mts --no-build         # reuse target/release
 *   node harness/scroll.mts --page nodes/sop/index --seconds 6
 *
 * A reader feels a dropped frame, not an average. The wheel turns at a fixed
 * rate and the page reports the gap between one drawn frame and the next, so
 * the number here is the number the hand feels: how many frames arrived late,
 * and the worst wait inside the run.
 *
 * A frame is late over 20ms (a 60Hz display gives 16.7ms), and stalled over
 * 50ms. `worst` is the longest gap between two drawn frames.
 *
 * Output: a table, and `harness/out/scroll/report.json`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { launch } from "./app.mts";

const OUT = "harness/out/scroll";
/** A short page, a long page of prose, and the 1,700-row index. */
const PAGES = ["nodes/sop/box", "nodes/sop/sphere", "nodes/sop/index"];

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const SECONDS = Number(flag("seconds", "5"));
const pages = args.includes("--page") ? [flag("page", PAGES[0])] : PAGES;

interface Run {
  page: string;
  /** Frames drawn while the wheel turned. */
  frames: number;
  late: number;
  stalled: number;
  worst: number;
  median: number;
  /** Pixels the page actually moved. A page that does not follow the wheel
      reads as smooth and is not: the number says whether it moved. */
  moved: number;
  longTasks: number[];
  nodes: number;
}

const app = await launch();
const { page } = app;
const report: Run[] = [];
try {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("http://tauri.localhost/nodes/sop/box");
  await page.waitForFunction(
    () => (window as any).__TAURI_INTERNALS__.invoke("index_status").then((s: any) => s.done && s.pages > 0),
    null,
    { polling: 1000, timeout: 600000 },
  );
  for (const path of pages) {
    await page.goto(`http://tauri.localhost/${path}`);
    await page.waitForTimeout(4000);
    // The wheel lands where the prose is, not on the panel.
    await page.mouse.move(660, 500);
    await page.evaluate(() => {
      const w = window as unknown as { __scroll: { gaps: number[]; tasks: number[]; from: number; stop: () => void } };
      const gaps: number[] = [];
      const tasks: number[] = [];
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) tasks.push(Math.round(entry.duration));
      });
      obs.observe({ type: "longtask" });
      const scroller = [...document.querySelectorAll("*")]
        .filter((el) => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.clientHeight > 200)
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (!scroller) throw new Error("no scroller on the page");
      let last = performance.now();
      let live = true;
      const tick = () => {
        const now = performance.now();
        gaps.push(now - last);
        last = now;
        if (live) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      w.__scroll = {
        gaps,
        tasks,
        from: scroller.scrollTop,
        stop: () => {
          live = false;
          obs.disconnect();
          (w.__scroll as unknown as { to: number }).to = scroller.scrollTop;
        },
      };
    });
    const until = Date.now() + SECONDS * 1000;
    while (Date.now() < until) {
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(40);
    }
    const run = await page.evaluate(() => {
      const w = window as unknown as { __scroll: { gaps: number[]; tasks: number[]; from: number; to: number; stop: () => void } };
      w.__scroll.stop();
      const { gaps, tasks, from, to } = w.__scroll;
      // The first gap is the wait before the first frame, not a drawn frame.
      const drawn = gaps.slice(1);
      const sorted = [...drawn].sort((a, b) => a - b);
      return {
        frames: drawn.length,
        late: drawn.filter((ms) => ms > 20).length,
        stalled: drawn.filter((ms) => ms > 50).length,
        worst: Math.round(Math.max(0, ...drawn)),
        median: Math.round(sorted[sorted.length >> 1] ?? 0),
        moved: Math.round(to - from),
        longTasks: tasks.filter((ms) => ms > 50),
        nodes: document.querySelectorAll("*").length,
      };
    });
    report.push({ page: path, ...run });
    console.log(
      `${path.padEnd(20)} frames ${String(run.frames).padStart(4)}  late ${String(run.late).padStart(4)}` +
        `  stalled ${String(run.stalled).padStart(3)}  median ${String(run.median).padStart(3)}ms` +
        `  worst ${String(run.worst).padStart(4)}ms  moved ${String(run.moved).padStart(6)}px  nodes ${run.nodes}`,
    );
  }
} finally {
  await app.stop();
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(`\n${OUT}/report.json`);
