/**
 * Click learning is the one part of search whose behaviour changes over time,
 * so it is the part most able to go wrong quietly.
 *
 *   bun test lib/search/clicks.test.ts
 */
import { expect, test, beforeEach } from "bun:test";

// Minimal localStorage — the module only ever get/set/removes one key.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { recordClick, applyClickBoost, clearClicks } = await import("./clicks");

const row = (path: string, score: number | null = 1) => ({ path, score });
const paths = (rs: { path: string }[]) => rs.map((r) => r.path);

beforeEach(() => clearClicks());

test("a clicked page climbs for the same query", () => {
  const results = [row("a"), row("b"), row("c")];
  expect(paths(applyClickBoost("copy points", results))).toEqual(["a", "b", "c"]);

  recordClick("copy points", "c");
  expect(paths(applyClickBoost("copy points", results))[0]).toBe("c");
});

test("learning carries to a query still being typed", () => {
  recordClick("copy points", "c");
  // "copy poi" is on its way to "copy points" — the boost should already apply.
  expect(paths(applyClickBoost("copy poi", [row("a"), row("b"), row("c")]))[0]).toBe("c");
});

test("an unrelated query is untouched", () => {
  recordClick("copy points", "c");
  expect(paths(applyClickBoost("pyro solver", [row("a"), row("b"), row("c")]))).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("a page the ranker did not return is never invented", () => {
  // The only guard against a stray click pinning the wrong page: promotion can
  // reorder the result list, never add to it.
  for (let i = 0; i < 50; i++) recordClick("q", "not-in-results");
  expect(paths(applyClickBoost("q", [row("a"), row("b")]))).toEqual(["a", "b"]);
});

test("unlearned results keep the order the ranker gave them", () => {
  recordClick("q", "c");
  expect(paths(applyClickBoost("q", [row("a"), row("b"), row("c"), row("d")]))).toEqual([
    "c",
    "a",
    "b",
    "d",
  ]);
});

test("the most-clicked page leads", () => {
  recordClick("q", "d");
  recordClick("q", "b");
  recordClick("q", "b");
  expect(paths(applyClickBoost("q", [row("a"), row("b"), row("c"), row("d")])).slice(0, 2)).toEqual(
    ["b", "d"],
  );
});

test("storage does not grow without bound", () => {
  for (let i = 0; i < 260; i++) recordClick(`query ${i}`, `p${i}`);
  expect(JSON.parse(store.get("houdinimd:clicks")!).length).toBeLessThanOrEqual(200);
});

test("unreadable storage degrades to no learning", () => {
  store.set("houdinimd:clicks", "{ not json");
  expect(paths(applyClickBoost("q", [row("a"), row("b")]))).toEqual(["a", "b"]);
});
