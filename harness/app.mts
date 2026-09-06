/**
 * THE SHIPPED BINARY, WATCHED WHILE IT DOES NOTHING.
 *
 * Two of the spec's numbers are about the app when nobody is touching it:
 * memory at rest, and processor time at rest. "A doc reader that spins a core
 * is a bug", and the only way to know is to start the real thing and watch it.
 *
 * The window never appears on this machine — it has no interactive desktop —
 * but the process runs, indexes, and holds memory exactly as it would with a
 * window in front of it. Everything below is read from the process, not from
 * the screen, so the absence of a screen costs nothing.
 *
 * It also reads the process priority. The spec asks the app to leave the cores
 * to Houdini; `index.rs` puts the INDEXING THREAD into background mode, and
 * this reports what the PROCESS is set to, which is a different question and
 * currently a different answer.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

export interface AppSample {
  /** Processor seconds the whole process used over the watch, as a share of
   *  one core. 0.02 means two per cent of one core. */
  idleCores: number;
  /** Resident memory at the end of the watch. */
  memoryMb: number;
  /** What Windows has the process scheduled at: Normal, BelowNormal, Idle. */
  priority: string;
}

const EXE = "src-tauri/target/release/HoudiniMD.exe";

/** PowerShell, because the numbers wanted are the ones Windows keeps. */
function ask(script: string): string {
  const res = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
  return (res.stdout ?? "").trim();
}

function counters(pid: number): { cpu: number; memory: number; priority: string } | null {
  const out = ask(
    `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { "{0} {1} {2}" -f $p.TotalProcessorTime.TotalSeconds, $p.WorkingSet64, $p.PriorityClass }`,
  );
  const [cpu, memory, priority] = out.split(/\s+/);
  if (!cpu) return null;
  return { cpu: Number(cpu), memory: Number(memory), priority: priority ?? "unknown" };
}

/**
 * Starts the built app, lets it finish indexing, then watches it sit still.
 *
 * `seconds` is the watch itself. It is long rather than short on purpose: a
 * timer that fires once a second is invisible over one second and obvious over
 * twenty.
 */
export async function watchIdleApp(seconds = 20): Promise<AppSample | null> {
  if (!existsSync(EXE)) {
    console.error(`no ${EXE} — run \`cargo build --release\` in src-tauri first`);
    return null;
  }
  const child: ChildProcess = spawn(EXE, [], { stdio: "ignore", detached: false });
  const pid = child.pid!;
  try {
    // The background pass takes a couple of seconds on a build it has never
    // seen and no time at all on one it has. Waiting through it is what makes
    // this an IDLE number rather than an indexing one.
    await new Promise((r) => setTimeout(r, 15_000));
    const before = counters(pid);
    if (!before) return null;
    await new Promise((r) => setTimeout(r, seconds * 1000));
    const after = counters(pid);
    if (!after) return null;
    return {
      idleCores: (after.cpu - before.cpu) / seconds,
      memoryMb: after.memory / 1024 / 1024,
      priority: after.priority,
    };
  } finally {
    child.kill();
    // Tauri leaves the webview host behind if the parent is killed rudely.
    ask(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`);
  }
}
