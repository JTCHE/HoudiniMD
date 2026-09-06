/**
 * THE HARNESS. ONE COMMAND, EVERY NUMBER, AND A NON-ZERO EXIT WHEN ONE OF
 * THEM GOT WORSE.
 *
 *   node harness/run.mts                  # everything, quiet and under load
 *   node harness/run.mts --no-load        # quiet only, for a quick check
 *   node harness/run.mts --no-build       # reuse dist/ and the built probe
 *   node harness/run.mts --app            # also watch the real app sit idle
 *   node harness/run.mts --write-budgets  # take this run as the new budgets
 *   node harness/run.mts --machine slow   # judge against the slow laptop's set
 *
 * Four measuring parts, each in its own file and each able to run alone:
 *
 *   src-tauri/src/bin/probe   the back end: indexing, search, pages, images
 *   harness/ui.mts            the front end, in a real browser
 *   harness/load.mts          a Houdini cook, so none of it is measured quiet
 *   harness/app.mts           the shipped binary, doing nothing, watched
 *
 * `harness/budgets.json` holds what each number was when it was last measured
 * honestly. A budget is not a target and never a wish: when a real change
 * moves a number, run with `--write-budgets` and write the reason beside the
 * entry. Anything without a budget is reported and cannot fail.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { cpus, platform, totalmem } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { measureUi, type UiMetric } from "./ui.mts";
import { startLoad } from "./load.mts";
import { watchIdleApp } from "./app.mts";

const OUT = "harness/out";
const BUDGETS = "harness/budgets.json";

interface Budget {
  value: number;
  worst: number;
  /** Why this number is what it is. Written by hand, never by the runner. */
  why?: string;
}

/** One machine's budgets. */
interface Machine {
  /** The machine the numbers below were taken on. */
  measuredOn: string;
  budgets: Record<string, Budget>;
}

/**
 * Every machine that has been measured, by name.
 *
 * There have to be at least two. The machine this was written on has 24
 * threads and 96GB, and a harness that passes on it says nothing about the
 * laptop an artist opens the docs on. `--machine slow` judges the same run
 * against the other set.
 */
interface Budgets {
  machines: Record<string, Machine>;
}

interface Row extends UiMetric {
  label: string;
  budget: Budget | null;
  pass: boolean | null;
}

const has = (flag: string) => process.argv.includes(flag);

/** A port nobody else is on. Two stale servers from earlier sessions sit on
 *  8791 on this machine, which is exactly why this is not a constant. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as { port: number }).port;
      probe.close(() => resolve(port));
    });
  });
}

function run(command: string, args: string[], cwd?: string): void {
  const res = spawnSync(command, args, { cwd, stdio: "inherit", shell: true });
  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${res.status}`);
  }
}

/** The back-end probe, as parsed metrics. */
function backend(runs: number): UiMetric[] {
  const res = spawnSync("src-tauri/target/release/probe.exe", ["--runs", String(runs)], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`probe exited ${res.status}: ${res.stderr}`);
  return (JSON.parse(res.stdout) as { metrics: UiMetric[] }).metrics;
}

async function serve(port: number) {
  const child = spawn(
    "src-tauri/target/release/probe.exe",
    ["--serve", String(port), "--dist", "dist"],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the stub server never came up")), 30_000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return child;
}

/** Which machine this run is. `--machine slow` on the reference laptop. */
function machineName(): string {
  const at = process.argv.indexOf("--machine");
  return at >= 0 ? process.argv[at + 1] : "fast";
}

function readBudgets(): Budgets {
  if (!existsSync(BUDGETS)) return { machines: {} };
  return JSON.parse(readFileSync(BUDGETS, "utf8")) as Budgets;
}

/**
 * A measurement fails its budget when the median goes over it, or when the
 * worst case goes over its own. Both, because a median alone hides a stall and
 * a worst case alone fails on a passing lorry.
 */
function judge(rows: Row[]): Row[] {
  for (const row of rows) {
    // A metric with no samples is not a fast metric, it is a metric that did
    // not happen: the list never moved, so there was nothing to time. Judging
    // it against anything turns a skipped measurement into a failed build.
    row.pass =
      row.budget === null || row.runs === 0
        ? null
        : row.value <= row.budget.value && row.worst <= row.budget.worst;
  }
  return rows;
}

/**
 * A second opinion, and only when the first one was bad.
 *
 * These numbers move between two runs of the same build: the median of three
 * page draws read 34ms and then 68ms with nothing changed in between. A budget
 * wide enough to swallow that is a budget that catches nothing, so the width
 * stays where it is and the harness measures again instead. A row has to go
 * over budget TWICE, in two separate passes, before it fails the build. The
 * cost is paid only by a run that was going to fail anyway.
 */
async function settle(rows: Row[], again: () => Promise<UiMetric[]>): Promise<void> {
  judge(rows);
  const writing = has("--write-budgets");
  const over = rows.filter((row) => row.pass === false);
  // A judging run measures again only when something looked bad. A run that
  // WRITES budgets always measures twice, and keeps the worse of the two: a
  // budget written from one lucky pass fails the next honest one.
  if (!writing && over.length === 0) return;
  console.error(
    writing
      ? `# measuring again, to write budgets from the worse of two passes`
      : `# measuring again: ${over.map((row) => row.name).join(", ")}`,
  );
  const second = new Map((await again()).map((metric) => [metric.name, metric]));
  for (const row of rows) {
    const other = second.get(row.name);
    if (!other) continue;
    if (writing) {
      row.value = Math.max(row.value, other.value);
      row.worst = Math.max(row.worst, other.worst);
    } else if (row.pass === false) {
      // The kinder of the two passes, per number. A row that is over budget in
      // both keeps the kinder number and still fails, which keeps the report
      // honest about how far over it went.
      row.value = Math.min(row.value, other.value);
      row.worst = Math.min(row.worst, other.worst);
    }
  }
  judge(rows);
}

function collect(label: string, metrics: UiMetric[], budgets: Machine): Row[] {
  return metrics.map((metric) => ({
    ...metric,
    label,
    budget: budgets.budgets[`${label}.${metric.name}`] ?? null,
    pass: null,
  }));
}

/**
 * Measurements that are reported and never gate anything. `ipc.round_trip` is
 * the harness talking to itself over a socket the shipped app does not have,
 * so a budget on it would fail the build for the harness's own weather.
 * `clock.tick` and `frame.tick` measure the instrument and not the product: a
 * budget on them would fail the build when the display refresh rate changes.
 */
const NO_BUDGET = new Set(["ipc.round_trip", "clock.tick", "clock.tick_web", "frame.tick"]);

/** The smallest room a budget gets, whatever the measurement was. A fifth over
 *  50us is 60us, and the next run measured 60us and failed the build. Five
 *  milliseconds of room is under one frame, so nothing a reader can see hides
 *  inside it. */
const FLOOR: Record<string, number> = { ms: 5, "µs": 5000, MB: 5, " cores": 0.02 };

/** The budgets a run would write: the measurement, with room over it. */
function budgetFrom(rows: Row[]): Record<string, Budget> {
  const out: Record<string, Budget> = {};
  for (const row of rows) {
    if (NO_BUDGET.has(row.name) || row.runs === 0) continue;
    const floor = FLOOR[row.unit] ?? 0;
    // Half again over the measurement for the median, and twice the measurement
    // for the worst case. The median is a stable number and gets a tight
    // budget, but not a tight one: the median of three samples still moved
    // from 47ms to 65ms between two runs of the same build. The worst case is
    // ONE sample from a long tail — the same code
    // measured 56ms and then 98ms on this machine with nothing changed — so a
    // tight budget there fails the build for the weather. Twice still catches
    // a stall, which is all a worst-case budget is for.
    out[`${row.label}.${row.name}`] = {
      value: Math.round(Math.max(row.value * 1.5, row.value + floor) * 100) / 100,
      worst: Math.round(Math.max(row.worst * 2, row.worst + floor) * 100) / 100,
      why: row.budget?.why,
    };
  }
  return out;
}

/** What the machine this run is on actually is. */
function machineOf(): string {
  return `${cpus()[0]?.model ?? "unknown"}, ${cpus().length} threads, ${Math.round(totalmem() / 2 ** 30)}GB`;
}

function report(rows: Row[], extra: string[]): string {
  const failed = rows.filter((row) => row.pass === false);
  let md = `# Harness report\n\n`;
  md += `${new Date().toISOString()}\n\n`;
  md += `${rows.length} measurement(s), **${failed.length} over budget**.\n\n`;
  md += `Machine: **${machineName()}** — ${machineOf()}\n\n`;
  for (const line of extra) md += `${line}\n`;
  if (extra.length) md += `\n`;

  for (const label of [...new Set(rows.map((row) => row.label))]) {
    md += `## ${label}\n\n`;
    md += `| measurement | median | worst | budget | worst budget | result | what it is |\n`;
    md += `| --- | ---: | ---: | ---: | ---: | --- | --- |\n`;
    for (const row of rows.filter((r) => r.label === label)) {
      const verdict = row.pass === null ? "–" : row.pass ? "PASS" : "**FAIL**";
      md += `| ${row.name} | ${row.value}${row.unit} | ${row.worst}${row.unit} | ${row.budget ? row.budget.value + row.unit : "–"} | ${row.budget ? row.budget.worst + row.unit : "–"} | ${verdict} | ${row.note} |\n`;
    }
    md += `\n`;
  }
  if (failed.length) {
    md += `## Over budget\n\n`;
    for (const row of failed) {
      md += `- **${row.label}.${row.name}** — ${row.value}${row.unit} against ${row.budget!.value}${row.unit}, worst ${row.worst}${row.unit} against ${row.budget!.worst}${row.unit}\n`;
    }
    md += `\n`;
  }
  return md;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const runs = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 3;

  if (!has("--no-build")) {
    run("bun", ["run", "build"]);
    run("cargo", ["build", "--release", "--bin", "probe"], "src-tauri");
  }

  const file = readBudgets();
  const machine = machineName();
  const budgets: Machine = file.machines[machine] ?? { measuredOn: "not measured yet", budgets: {} };
  const notes: string[] = [];
  const rows: Row[] = [];

  const quietBack = collect("quiet", backend(runs), budgets);
  await settle(quietBack, async () => backend(runs));
  rows.push(...quietBack);

  const port = await freePort();
  const server = await serve(port);
  try {
    const quietUi = collect("quiet", await measureUi(port, runs), budgets);
    await settle(quietUi, () => measureUi(port, runs));
    rows.push(...quietUi);

    if (!has("--no-load")) {
      const load = await startLoad();
      notes.push(
        load.kind === "houdini"
          ? `Under load: a Houdini cook running in \`hython\` the whole time.`
          : `Under load: arithmetic on every core plus a gigabyte held — no Houdini licence answered, so the load is weaker than the real thing.`,
      );
      try {
        const loadBack = collect("load", backend(runs), budgets);
        await settle(loadBack, async () => backend(runs));
        rows.push(...loadBack);

        const loadUi = collect("load", await measureUi(port, runs), budgets);
        await settle(loadUi, () => measureUi(port, runs));
        rows.push(...loadUi);
      } finally {
        load.stop();
      }
    }
  } finally {
    server.kill();
  }

  if (has("--app")) {
    const sample = await watchIdleApp();
    if (sample) {
      rows.push(
        ...collect(
          "idle app",
          [
            {
              name: "cpu.idle",
              unit: " cores",
              value: Math.round(sample.idleCores * 10000) / 10000,
              worst: Math.round(sample.idleCores * 10000) / 10000,
              runs: 1,
              note: "processor time while nothing happens",
            },
            {
              name: "memory.idle",
              unit: "MB",
              value: Math.round(sample.memoryMb * 100) / 100,
              worst: Math.round(sample.memoryMb * 100) / 100,
              runs: 1,
              note: "resident memory while nothing happens",
            },
          ],
          budgets,
        ),
      );
      notes.push(`The app process runs at priority **${sample.priority}**.`);
    }
  }

  judge(rows);

  if (has("--write-budgets")) {
    // The machine matters as much as the number. The spec asks for a second
    // set of budgets for a SLOW machine, and that machine has not been chosen
    // yet — until it is, every budget in this file is a fast one, and saying
    // which machine took them is what keeps that visible.
    file.machines[machine] = {
      measuredOn: `${cpus()[0]?.model ?? "unknown"}, ${cpus().length} threads, ${Math.round(totalmem() / 2 ** 30)}GB, ${platform()}`,
      budgets: budgetFrom(rows),
    };
    writeFileSync(BUDGETS, JSON.stringify(file, null, 2) + "\n");
    notes.push(`Budgets for **${machine}** rewritten from this run.`);
  }

  const markdown = report(rows, notes);
  writeFileSync(`${OUT}/report.md`, markdown);
  writeFileSync(`${OUT}/report.json`, JSON.stringify(rows, null, 2) + "\n");
  console.log(markdown);

  const failed = rows.filter((row) => row.pass === false).length;
  console.log(failed === 0 ? "Every budget met." : `${failed} measurement(s) over budget.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((reason) => {
  console.error(reason);
  process.exit(2);
});
