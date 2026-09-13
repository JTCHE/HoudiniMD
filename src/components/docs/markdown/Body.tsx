import { createElement, Fragment, memo, startTransition, useEffect, useMemo, useState, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { Fragment as JsxFragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime, type Options } from "hast-util-to-jsx-runtime";
import type { Components } from "react-markdown";
import type { Element, Root, RootContent } from "hast";
import { LongList } from "./LongList";

/** Blocks, or items of a long list, drawn per commit. */
const SLICE = 100;
/** Slices in the first commit: the top of any page. */
const FIRST = 2;

function draw(node: Root | Element, components: Components): ReactElement {
  return toJsxRuntime(node, {
    Fragment: JsxFragment,
    jsx,
    jsxs,
    components: components as Options["components"],
    ignoreInvalidStyle: true,
    passKeys: true,
    passNode: true,
  }) as ReactElement;
}

const Slice = memo(function Slice({ nodes, components }: { nodes: RootContent[]; components: Components }) {
  return draw({ type: "root", children: nodes }, components);
});

interface Part {
  /** A long list: drawn as a window over its rows, not as slices. */
  list?: { shell: ReactElement; rows: RootContent[] };
  slices: ReactElement[];
}

function layout(tree: Root, components: Components): Part[] {
  const parts: Part[] = [];
  const slice = (nodes: RootContent[]) => <Slice key={parts.length} nodes={nodes} components={components} />;
  let loose: RootContent[] = [];
  const flush = () => {
    if (loose.length) parts.push({ slices: [slice(loose)] });
    loose = [];
  };
  for (const node of tree.children) {
    if (node.type === "element" && (node.tagName === "ul" || node.tagName === "ol") && node.children.length > SLICE) {
      flush();
      // The rows themselves: the line breaks between them are text nodes, and
      // a window that counts them counts a height that is not there.
      const rows = node.children.filter((child) => child.type !== "text" || child.value.trim() !== "");
      parts.push({ list: { shell: draw({ ...node, children: [] }, components), rows }, slices: [] });
    } else {
      loose.push(node);
      if (loose.length >= SLICE) flush();
    }
  }
  flush();
  return parts;
}

/**
 * A page's body, drawn a slice at a time. A long index page is two thousand
 * links: drawn in one commit, the window froze for half a second between the
 * press and the page. The top of the page draws at once and the rest follows
 * in transitions, one per frame, so the window answers while it fills. A list
 * of hundreds of rows is a window over its rows (`LongList`), so the document
 * never holds them all.
 *
 * `whole` draws everything at once, for a reader who arrives at a place in the
 * page (an anchor, a search excerpt) that has to exist to be scrolled to.
 */
export function Body({ tree, components, whole }: { tree: Root; components: Components; whole: boolean }) {
  const parts = useMemo(() => layout(tree, components), [tree, components]);
  // A long list counts as one unit of the fill, like a slice.
  const total = parts.reduce((sum, part) => sum + (part.list ? 1 : part.slices.length), 0);
  const [shown, setShown] = useState(FIRST);
  const count = whole ? total : shown;
  // A print is the page at its full length, even one still filling.
  useEffect(() => {
    const all = () => flushSync(() => setShown(Infinity));
    window.addEventListener("beforeprint", all);
    return () => window.removeEventListener("beforeprint", all);
  }, []);
  useEffect(() => {
    if (count >= total) return;
    // After the browser has drawn this slice.
    const timer = setTimeout(() => startTransition(() => setShown((n) => n + 1)));
    return () => clearTimeout(timer);
  }, [count, total]);

  let left = count;
  return parts.map((part, index) => {
    if (part.list) {
      const room = left;
      left -= 1;
      if (room < 1) return null;
      return (
        <LongList
          key={index}
          shell={part.list.shell}
          rows={part.list.rows}
          whole={whole || count === Infinity}
          draw={(nodes, key) => <Slice key={key} nodes={nodes} components={components} />}
        />
      );
    }
    const slices = part.slices.slice(0, Math.max(0, left));
    left -= part.slices.length;
    if (!slices.length) return null;
    return createElement(Fragment, { key: index }, ...slices);
  });
}
