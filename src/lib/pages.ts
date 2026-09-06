/**
 * Pages already read, and the one the pointer is over.
 *
 * A reader walks back and forth over a handful of pages — a node, the function
 * it names, back to the node — and every one of those steps used to be a fresh
 * read and parse. From here they are free.
 *
 * The cap is what a walk like that reaches, not what a session reaches: holding
 * every page a long session opens would hold most of the corpus in memory, and
 * the pages beyond the last few are not the ones being walked.
 *
 * `warm` is the other half. Reading a page costs 100–350ms of zip and parse,
 * and the pointer spends longer than that travelling to the row it is going to
 * press. Starting the read when the pointer arrives, rather than when the
 * button goes down, is what makes the page look like it was already open.
 */
import { invoke } from "./backend";

export interface PageView {
  path: string;
  name: string;
  nodeType?: string;
  icon?: string;
  since?: string;
  summary?: string;
  markdown: string;
  version: string;
}

export interface PageError {
  missing: boolean;
  message: string;
}

const READ = new Map<string, PageView>();
const KEEP = 30;
/** Reads under way, so a pointer that wanders over a row twice reads once. */
const READING = new Map<string, Promise<PageView>>();

export function known(path: string): PageView | undefined {
  return READ.get(path);
}

function remember(path: string, page: PageView) {
  READ.set(path, page);
  if (READ.size > KEEP) READ.delete(READ.keys().next().value!);
}

export function read(path: string): Promise<PageView> {
  const held = READING.get(path);
  if (held) return held;
  const reading = invoke<PageView>("page", { path })
    .then((view) => {
      remember(path, view);
      return view;
    })
    .finally(() => {
      READING.delete(path);
    });
  READING.set(path, reading);
  return reading;
}

/** Start reading a page nobody has asked for yet. A failure here is not the
    reader's business — they have not pressed anything — so it is swallowed
    and the real navigation reports it. */
export function warm(path: string) {
  if (READ.has(path) || READING.has(path)) return;
  void read(path).catch(() => {});
}
