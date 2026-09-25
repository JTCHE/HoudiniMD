import { useMemo } from "react";
import type { Element, Root } from "hast";
import { Paperclip } from "lucide-react";
import { openLightbox, PAGE_PICTURES } from "@/lib/lightbox";
import { Hint } from "@/components/ui/Hint";

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
        onClick={() => {
          const first = document.querySelector<HTMLImageElement>(PAGE_PICTURES);
          if (first) openLightbox(first);
        }}
        className="flex h-8 shrink-0 cursor-interactive items-center gap-1 rounded-lg border border-input bg-muted/50 px-2 text-xs tabular-nums text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Paperclip className="size-3.5" aria-hidden="true" />
        {total}
      </button>
    </Hint>
  );
}
