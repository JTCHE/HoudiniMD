import { cloneElement, createElement, Fragment, memo, startTransition, useEffect, useMemo, useState, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { Fragment as JsxFragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime, type Options } from "hast-util-to-jsx-runtime";
import type { Components } from "react-markdown";
import type { Element, Root, RootContent } from "hast";

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
  /** A long list, drawn once, that its slices fill. */
  shell?: ReactElement;
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
      const slices = [];
      for (let at = 0; at < node.children.length; at += SLICE) {
        slices.push(<Slice key={at} nodes={node.children.slice(at, at + SLICE)} components={components} />);
      }
      parts.push({ shell: draw({ ...node, children: [] }, components), slices });
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
 * in transitions, one per frame, so the window answers while it fills.
 *
 * `whole` draws everything at once, for a reader who arrives at a place in the
 * page (an anchor, a search excerpt) that has to exist to be scrolled to.
 */
export function Body({ tree, components, whole }: { tree: Root; components: Components; whole: boolean }) {
  const parts = useMemo(() => layout(tree, components), [tree, components]);
  const total = parts.reduce((sum, part) => sum + part.slices.length, 0);
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
    const slices = part.slices.slice(0, Math.max(0, left));
    left -= part.slices.length;
    if (!slices.length) return null;
    return part.shell ? cloneElement(part.shell, { key: index }, ...slices) : createElement(Fragment, { key: index }, ...slices);
  });
}
