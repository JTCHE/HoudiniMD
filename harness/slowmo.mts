/**
 * THE WINDOW IN SLOW MOTION, ONE FRAME AT A TIME.
 *
 *   node harness/slowmo.mts                        # build, serve, every flow
 *   node harness/slowmo.mts --port 8821            # against a running --serve
 *   node harness/slowmo.mts --flow link --rate 0.05 --interval 8
 *
 * A flash of empty content, an icon that pops in, a heading that jumps: each
 * lasts one or two frames at full speed, which is too short to see and too
 * short to describe. This slows the page down and films it.
 *
 * - `Animation.setPlaybackRate` slows every CSS transition and animation.
 * - `Emulation.setCPUThrottlingRate` slows script, so a render that runs late
 *   runs visibly late.
 * - The network gets a fixed latency, so a page payload or an icon arrives
 *   after the frame that asked for it, the way a cold read does.
 * - `Page.startScreencast` hands over every frame the compositor draws. The
 *   frames are then laid on a regular clock (`--interval`, in wall-clock ms),
 *   so frame N is always N intervals after the press.
 *
 * ponytail: timers (`setTimeout`) run on the wall clock and are not slowed. A
 * delay the app sets in script is shorter, relative to the animations, than it
 * is at full speed. Virtual time would fix that, and costs a rewrite of the
 * capture loop.
 *
 * Output, per flow, in `harness/out/slowmo/<flow>/`: the frames, a contact
 * sheet (`index.html`), and `report.json`. The report lists every frame that
 * changed, and every FLASH: a frame unlike both of its neighbours while the
 * neighbours are like each other — something drawn and taken away, or taken
 * away and drawn again.
 */
import { chromium, type CDPSession, type Page } from "playwright";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import sharp from "sharp";

const OUT = "harness/out/slowmo";
const VIEW = { width: 1280, height: 820 };
/** Narrow enough that the contents list is the inline list and the pill. */
const NARROW = { width: 900, height: 700 };

interface Flow {
  name: string;
  /** Where the flow starts. Loaded and settled before the film starts. */
  from: string;
  view?: { width: number; height: number };
  /** Run after `from` settles and before the film starts. */
  setup?: (page: Page) => Promise<void>;
  /** What the reader does. The film runs from here. */
  act: (page: Page) => Promise<void>;
}

/** One per kind of move a reader makes. Paths are shapes, not SideFX text. */
const FLOWS: Flow[] = [
  { name: "boot", from: "about:blank", act: async (page) => void (await page.goto(`${base()}nodes/sop/box`)) },
  {
    name: "home-link",
    from: "",
    act: async (page) => page.click('a[href="/nodes/sop/index"]'),
  },
  {
    name: "link",
    from: "nodes/sop/box",
    act: async (page) => page.click('article a[href^="/nodes/sop/"]'),
  },
  {
    name: "back",
    from: "nodes/sop/box",
    act: async (page) => {
      await page.click('article a[href^="/nodes/sop/"]');
      await page.waitForTimeout(1500);
      await page.goBack();
    },
  },
  {
    name: "search",
    from: "nodes/sop/box",
    act: async (page) => {
      await page.keyboard.press("Control+k");
      await page.keyboard.type("copy to points", { delay: 60 });
      await page.keyboard.press("Enter");
    },
  },
  {
    // Scrolled down, so the pill is up, then a link to another long page.
    name: "toc",
    from: "nodes/sop/box",
    view: NARROW,
    setup: async (page) => {
      await page.evaluate(() => {
        const shell = document.querySelector(".docs-shell")!;
        shell.scrollTop = shell.scrollHeight;
      });
      await page.waitForTimeout(800);
    },
    // A click from script: Playwright's own click scrolls the link into view,
    // and that scroll would hide the pill before the navigation starts.
    act: async (page) =>
      page.evaluate(() => {
        const links = [...document.querySelectorAll<HTMLAnchorElement>("article a[href^='/nodes/sop/']")];
        links.filter((a) => a.getAttribute("href") !== location.pathname).at(-1)!.click();
      }),
  },
];

let port = 0;
const base = () => `http://localhost:${port}/`;

interface Frame {
  /** Wall-clock seconds, from the compositor. */
  at: number;
  data: Buffer;
}

async function film(page: Page, cdp: CDPSession, act: () => Promise<void>, hold: number): Promise<Frame[]> {
  const frames: Frame[] = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ at: metadata.timestamp ?? Date.now() / 1000, data: Buffer.from(data, "base64") });
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 });
  // The screencast sends a frame only when something is drawn. One frame of
  // the settled page before the press is the reference the rest compare to.
  await page.waitForTimeout(300);
  const pressed = Date.now() / 1000;
  await act();
  await page.waitForTimeout(hold);
  await cdp.send("Page.stopScreencast");
  cdp.removeAllListeners("Page.screencastFrame");
  // The frame on screen at the press, then everything after it.
  const before = frames.filter((f) => f.at <= pressed).at(-1);
  return [...(before ? [{ ...before, at: pressed }] : []), ...frames.filter((f) => f.at > pressed)];
}

/** A small grey copy of a frame, for comparing frames by the numbers. */
async function thumb(frame: Buffer): Promise<Buffer> {
  return sharp(frame).resize(128, 82, { fit: "fill" }).greyscale().raw().toBuffer();
}

/** Mean difference, 0 to 255, and the box of cells that moved, in page px. */
function compare(a: Buffer, b: Buffer, view = VIEW) {
  let sum = 0;
  let box: [number, number, number, number] | null = null;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    if (d > 24) {
      const x = i % 128;
      const y = Math.floor(i / 128);
      box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
    }
  }
  const scale = (v: number, of: number, to: number) => Math.round((v / of) * to);
  return {
    diff: sum / a.length,
    box: box && {
      x: scale(box[0], 128, view.width),
      y: scale(box[1], 82, view.height),
      w: scale(box[2] - box[0] + 1, 128, view.width),
      h: scale(box[3] - box[1] + 1, 82, view.height),
    },
  };
}

async function write(flow: string, frames: Frame[], interval: number, rate: number, view = VIEW) {
  const dir = `${OUT}/${flow}`;
  mkdirSync(dir, { recursive: true });
  if (frames.length === 0) return { flow, frames: 0, changes: [], flashes: [] };
  // Lay the frames on a regular clock: tick N shows the last frame drawn at
  // or before N intervals after the press.
  const start = frames[0].at;
  const end = frames.at(-1)!.at;
  const ticks: Frame[] = [];
  for (let t = start, at = 0; t <= end + 1e-9; t += interval / 1000) {
    while (at + 1 < frames.length && frames[at + 1].at <= t) at += 1;
    ticks.push(frames[at]);
  }
  const thumbs = await Promise.all(ticks.map((f) => thumb(f.data)));
  const appMs = (tick: number) => Math.round(tick * interval * rate);
  const changes: { tick: number; appMs: number; diff: number; box: unknown }[] = [];
  const flashes: { tick: number; appMs: number; box: unknown }[] = [];
  for (let i = 1; i < ticks.length; i += 1) {
    const { diff, box } = compare(thumbs[i - 1], thumbs[i], view);
    if (diff > 0.5) changes.push({ tick: i, appMs: appMs(i), diff: Math.round(diff * 10) / 10, box });
    if (i + 1 < ticks.length) {
      const next = compare(thumbs[i], thumbs[i + 1]).diff;
      const around = compare(thumbs[i - 1], thumbs[i + 1]).diff;
      if (diff > 2 && next > 2 && around < Math.min(diff, next) / 3) flashes.push({ tick: i, appMs: appMs(i), box });
    }
  }
  const moved = new Set(changes.map((c) => c.tick));
  const flashed = new Set(flashes.map((f) => f.tick));
  ticks.forEach((frame, i) => writeFileSync(`${dir}/${String(i).padStart(4, "0")}.jpg`, frame.data));
  const cells = ticks
    .map((_, i) => {
      const name = `${String(i).padStart(4, "0")}.jpg`;
      const mark = flashed.has(i) ? "flash" : moved.has(i) ? "moved" : "";
      return `<figure class="${mark}"><img src="${name}" loading="lazy"><figcaption>#${i} · ${appMs(i)} ms${mark ? ` · ${mark}` : ""}</figcaption></figure>`;
    })
    .join("\n");
  writeFileSync(
    `${dir}/index.html`,
    `<!doctype html><title>${flow}</title><style>
body{font:12px system-ui;margin:12px;background:#222;color:#ddd}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:8px}
figure{margin:0;border:2px solid transparent}figure.moved{border-color:#e9b949}figure.flash{border-color:#ef4444}
img{width:100%;display:block}figcaption{padding:2px 4px}
</style><h1>${flow}</h1><p>${ticks.length} frames, one every ${interval} ms wall clock = ${interval * rate} ms at full speed. Yellow: changed. Red: flash.</p><main>${cells}</main>`,
  );
  return { flow, frames: ticks.length, changes, flashes };
}

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(tries = 240) {
  for (let at = 0; at < tries; at += 1) {
    try {
      if ((await fetch(base())).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`no answer from ${base()}`);
}

async function main() {
  const args = process.argv.slice(2);
  const rate = Number(flag(args, "--rate") ?? 0.1);
  const interval = Number(flag(args, "--interval") ?? 16);
  const cpu = Number(flag(args, "--cpu") ?? 4);
  const latency = Number(flag(args, "--latency") ?? 40);
  const only = flag(args, "--flow");
  const given = flag(args, "--port");

  if (!given && !args.includes("--no-build")) {
    for (const [cmd, cmdArgs, cwd] of [
      ["npx", ["vite", "build"], "."],
      ["cargo", ["build", "--bin", "probe"], "src-tauri"],
    ] as const) {
      const run = spawnSync(cmd, [...cmdArgs], { cwd, stdio: "inherit", shell: true });
      if (run.status !== 0) process.exit(run.status ?? 1);
    }
  }
  port = given ? Number(given) : await freePort();
  let server: ChildProcess | null = null;
  if (!given) {
    server = spawn("src-tauri/target/debug/probe.exe", ["--serve", String(port), "--dist", "dist"], { stdio: "ignore" });
  }

  // CHROME names a browser other than the one this Playwright pins.
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const results = [];
  try {
    await waitForServer();
    rmSync(OUT, { recursive: true, force: true });
    for (const flow of FLOWS.filter((f) => !only || f.name === only)) {
      const context = await browser.newContext({ viewport: flow.view ?? VIEW, deviceScaleFactor: 1 });
      const page = await context.newPage();
      // Every flow starts in the app itself, not in the first-launch setup.
      await page.goto(base(), { waitUntil: "domcontentloaded" });
      await page.evaluate(() =>
        (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: object) => Promise<unknown> } })
          .__TAURI_INTERNALS__.invoke("set_setting", { key: "onboarded", value: "done" }),
      );
      if (flow.from !== "about:blank") {
        await page.goto(`${base()}${flow.from}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
      }
      await flow.setup?.(page);
      await page.mouse.move(2, 2);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Animation.enable");
      await cdp.send("Animation.setPlaybackRate", { playbackRate: rate });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      // Long enough for the slowest transition to finish at this rate.
      const hold = Math.min(20_000, Math.max(3000, 400 / rate));
      const frames = await film(page, cdp, () => flow.act(page), hold);
      const result = await write(flow.name, frames, interval, rate, flow.view);
      results.push(result);
      console.log(
        `${flow.name}: ${result.frames} frames, ${result.changes.length} changed, ${result.flashes.length} flashes` +
          (result.flashes.length ? ` at app ms ${result.flashes.map((f) => f.appMs).join(", ")}` : ""),
      );
      await context.close();
    }
  } finally {
    await browser.close();
    server?.kill();
  }
  writeFileSync(`${OUT}/report.json`, `${JSON.stringify({ rate, interval, cpu, latency, results }, null, 2)}\n`);
  console.log(`\nContact sheets: ${OUT}/<flow>/index.html`);
}

if (!existsSync("harness")) {
  console.error("run this from the repo root");
  process.exit(2);
}

await main();
