/**
 * Scroll to a run of words on the page and mark it for a moment.
 *
 * A search excerpt is the index's snippet of one section: words from the page,
 * with `…` where the snippet was cut. The longest piece between the cuts is
 * found by its words, not its characters, because the index keeps no markup
 * and no punctuation of links. A match at or after `from`, the section the hit
 * named, wins over an earlier one.
 */
import { excerptText } from "@/lib/search";

const WORD = /[\p{L}\p{N}_]+/gu;
const HOLD_MS = 1600;

/** The words of a text, lower case, where each starts. A bare number is
    left out: the page draws a list's numbers, and the index writes them. */
function words(text: string) {
  return [...text.toLowerCase().matchAll(WORD)]
    .filter((m) => !/^\d+$/.test(m[0]))
    .map((m) => ({ word: m[0], at: m.index! }));
}

export function flashText(
  article: HTMLElement,
  layer: HTMLElement,
  scroller: HTMLElement,
  excerpt: string,
  from: Element | null,
): boolean {
  const piece = excerptText(excerpt)
    .split("…")
    .map((part) => part.trim())
    .sort((a, b) => b.length - a.length)[0];
  const all = words(piece ?? "").map((w) => w.word);
  if (all.length === 0) return false;

  // The article's text as one string, and where each text node starts in it.
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    text += node.nodeValue ?? "";
  }
  const page = words(text);

  let after = 0;
  if (from && article.contains(from)) {
    const before = document.createRange();
    before.setStart(article, 0);
    before.setEndBefore(from);
    after = before.toString().length;
  }

  const find = (want: string[]) => {
    let first = -1;
    for (let i = 0; i + want.length <= page.length; i += 1) {
      if (!want.every((word, j) => page[i + j].word === word)) continue;
      if (first < 0) first = i;
      if (page[i].at >= after) return i;
    }
    return first;
  };
  // The whole piece, then each half of it: a snippet can run across a list
  // or a table, where the page draws text the index does not have.
  const half = Math.ceil(all.length / 2);
  const tries = [all, all.slice(0, half), all.slice(half)].filter((want) => want.length >= 3 || want === all);
  let want = all;
  let first = -1;
  for (want of tries) {
    first = find(want);
    if (first >= 0) break;
  }
  if (first < 0) return false;

  const locate = (offset: number) => {
    let at = 0;
    while (at + 1 < starts.length && starts[at + 1] <= offset) at += 1;
    return { node: nodes[at], offset: offset - starts[at] };
  };
  const last = page[first + want.length - 1];
  const start = locate(page[first].at);
  const end = locate(last.at + last.word.length);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  // A third of the way down, where the eye lands on a page that just opened.
  const box = range.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  scroller.scrollBy({ top: box.top - view.top - scroller.clientHeight / 3, behavior: "instant" });

  // One mark per line. A range gives a box per inline element, so a link
  // and the text in it would each draw, and two tints read darker than one.
  const lines: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const rect of range.getClientRects()) {
    if (rect.width === 0) continue;
    const line = lines.find((l) => rect.top < l.bottom - 2 && rect.bottom > l.top + 2);
    if (!line) lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    else {
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
    }
  }
  const origin = layer.getBoundingClientRect();
  const marks = lines.map((line) => {
    const rect = { left: line.left, top: line.top, width: line.right - line.left, height: line.bottom - line.top };
    const mark = document.createElement("div");
    mark.className = "flash-mark";
    Object.assign(mark.style, {
      left: `${rect.left - origin.left - 2}px`,
      top: `${rect.top - origin.top}px`,
      width: `${rect.width + 4}px`,
      height: `${rect.height}px`,
    });
    layer.append(mark);
    return mark;
  });
  setTimeout(() => {
    for (const mark of marks) {
      mark.dataset.fading = "";
      // With reduced motion there is no transition, so no transitionend.
      setTimeout(() => mark.remove(), 1000);
    }
  }, HOLD_MS);
  return true;
}
