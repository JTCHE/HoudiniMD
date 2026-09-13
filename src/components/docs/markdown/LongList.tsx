import { cloneElement, startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import type { RootContent } from "hast";
import { scroller } from "../toc/measure";

/** Rows kept above and below what the reader can see, in pixels. */
const MARGIN = 900;
/** The window moves a block of rows at a time. A window that followed the
    scroll row by row redrew the list on every frame. */
const BLOCK = 25;
/** Height of a row before any row has been measured. */
const GUESS = 56;

/**
 * A list of hundreds of rows, with only the rows near the reader in the
 * document. An index page is 1,700 rows of a link, an icon and a line of
 * text — ten thousand elements. The engine walked all of them on every frame
 * of a scroll, and the page moved at eight frames a second.
 *
 * The model is one height for every row, measured from the rows that are
 * drawn. The list's own top padding holds `first * row` pixels, so the drawn
 * block sits where the model says it does, and the bottom padding holds the
 * rest of the list and absorbs the difference between the model and the real
 * height of the drawn rows. The page therefore keeps one length, and what the
 * reader sees never drifts away from where the model thinks it is.
 *
 * `whole` draws every row: a reader who arrives at an anchor, a search hit, or
 * the printer needs the whole list to exist.
 */
export function LongList({
  shell,
  rows,
  draw,
  whole,
}: {
  /** The empty `<ul>`/`<ol>` the markdown asked for, with its own attributes. */
  shell: ReactElement;
  rows: RootContent[];
  draw: (nodes: RootContent[], key: string) => ReactElement;
  whole: boolean;
}) {
  const host = useRef<HTMLElement>(null);
  /** Where the list starts, as a scrollTop value. Read when the page around it
      changes, never on the frames of a scroll: a rect read there makes the
      engine lay the whole page out again. */
  const listTop = useRef(0);
  const [row, setRow] = useState(GUESS);
  /** Real height of the rows now drawn. */
  const [drawnHeight, setDrawnHeight] = useState(0);
  const [[first, last], setWindow] = useState<[number, number]>([0, Math.min(rows.length, BLOCK * 2)]);

  const measure = useCallback(() => {
    const box = scroller();
    if (!box || !host.current) return;
    const top = box.scrollTop - listTop.current;
    let start = Math.max(0, Math.floor((top - MARGIN) / row));
    let end = Math.ceil((top + box.clientHeight + MARGIN) / row);
    start = Math.floor(start / BLOCK) * BLOCK;
    end = Math.min(rows.length, Math.max(start + BLOCK, Math.ceil(end / BLOCK) * BLOCK));
    // Off the frame that is scrolling: a refill that blocks it is a hitch.
    startTransition(() => setWindow(([a, b]) => (a === start && b === end ? [a, b] : [start, end])));
  }, [row, rows.length]);

  useLayoutEffect(() => {
    const list = host.current;
    const box = scroller();
    if (!list || !box || whole) return;
    listTop.current = list.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const drawn = [...list.children] as HTMLElement[];
    const height = drawn.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
    setDrawnHeight(height);
    // One row height for the whole list. It settles on the first block drawn
    // and then holds: a height that moved would move the page under the reader.
    if (drawn.length) setRow((old) => (old === GUESS ? Math.round(height / drawn.length) || GUESS : old));
  }, [first, last, whole]);

  useEffect(() => {
    const box = scroller();
    if (!box || whole) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    // The page above the list is still filling when the list first draws, so
    // the list moves down under it.
    const article = host.current?.closest("article");
    const resize = new ResizeObserver(() => {
      const list = host.current;
      if (list) listTop.current = list.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      measure();
    });
    if (article) resize.observe(article);
    measure();
    box.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      box.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure, whole]);

  if (whole) return cloneElement(shell, undefined, draw(rows, "all"));

  const above = first * row;
  const below = Math.max(0, rows.length * row - above - drawnHeight);
  // The space for the rows that are not drawn is the list's own padding, not
  // a blank row: a blank row is a child, and a child moves every `:first-child`
  // and `:nth-child` rule the help's own lists are drawn with.
  return cloneElement(
    shell as ReactElement<{ ref?: typeof host; style?: React.CSSProperties }>,
    { ref: host, style: { paddingTop: above, paddingBottom: below } },
    draw(rows.slice(first, last), `${first}`),
  );
}
