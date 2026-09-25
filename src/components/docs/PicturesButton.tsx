import { useMemo } from "react";
import type { Element, Root } from "hast";
import { Paperclip } from "lucide-react";
import { openLightbox } from "@/lib/lightbox";
import { Hint } from "@/components/ui/Hint";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_ICON, QUIET } from "@/lib/ui/button";

/** Under this many pictures the page is its own gallery. */
const MIN = 2;

/** How many figures the page holds: what the help wrote as a picture, not
    the inline icons (those carry `data-icon` and no `src`). */
function count(tree: Root): number {
  const seen = new Set<string>();
  const walk = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      const src = child.properties.src;
      if (child.tagName === "img" && typeof src === "string") seen.add(src);
      walk(child);
    }
  };
  walk(tree);
  return seen.size;
}

/** The page's pictures, one press away: the lightbox opens on the first,
    and the arrows walk the rest. */
export function PicturesButton({ tree }: { tree: Root }) {
  const total = useMemo(() => count(tree), [tree]);
  if (total < MIN) return null;
  return (
    <Hint label={`${total} pictures`}>
      <button
        type="button"
        aria-label={`Open the ${total} pictures of this page`}
        onClick={(event) => openLightbox(event.currentTarget)}
        className={cn(ACTION, QUIET, "gap-1.5 px-2.5 tabular-nums")}
      >
        <Paperclip className={ACTION_ICON} aria-hidden="true" />
        {total}
      </button>
    </Hint>
  );
}
