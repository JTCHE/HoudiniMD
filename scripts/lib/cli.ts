/**
 * Tiny CLI helpers — arg parsing, percentiles, formatted output.
 * No external deps. Kept here so every script in scripts/ stays import-light.
 */

export interface ParsedArgs {
  flags: Set<string>;
  /** Last value seen for each key (backwards-compatible). */
  values: Map<string, string>;
  /** All values seen for each key, in order (for repeated flags like --url). */
  multiValues: Map<string, string[]>;
  positional: string[];
}

/**
 * Parse argv into `--flag` (boolean) and `--key=value` / `--key value` pairs.
 * Anything that doesn't start with `--` is positional.
 * Repeated flags (e.g. --url a --url b) are collected in `multiValues`.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const multiValues = new Map<string, string[]>();
  const positional: string[] = [];

  const push = (key: string, val: string) => {
    values.set(key, val);
    const arr = multiValues.get(key);
    if (arr) arr.push(val);
    else multiValues.set(key, [val]);
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const eq = key.indexOf("=");
    if (eq !== -1) {
      push(key.slice(0, eq), key.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      push(key, next);
      i++;
    } else {
      flags.add(key);
    }
  }

  return { flags, values, multiValues, positional };
}

export function getNumber(args: ParsedArgs, key: string, fallback: number): number {
  const raw = args.values.get(key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be a number (got "${raw}")`);
  return n;
}

export function getString(args: ParsedArgs, key: string, fallback: string): string {
  return args.values.get(key) ?? fallback;
}

/** Linear-interpolation percentile of a sorted array of numbers. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

export function fmtMs(ms: number): string {
  if (ms < 10) return `${ms.toFixed(1)}ms`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function fmtPct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

/**
 * Deterministic shuffle via a seeded PRNG (mulberry32).
 * Allows reproducible perf-audit samples when --seed is provided.
 */
export function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** ANSI colours, no-op when not a TTY (avoids junk in piped output). */
const isTTY = typeof process !== "undefined" && !!process.stdout?.isTTY;
const wrap = (code: string) => (s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = {
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  cyan: wrap("36"),
  bold: wrap("1"),
};
