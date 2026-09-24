import { useMemo, useState } from "react";
import type { Element, Root } from "hast";
import { assetUrl } from "@/lib/assets";
import { openLightbox } from "@/lib/lightbox";
import { cn } from "@/lib/utils";
import { groundClass, groundFor, type Ground } from "@/lib/ground";

/** Under this many pictures the page is its own strip. */
const MIN = 2;

/** Every picture of the page, in page order: what the help wrote as a
    figure, not the inline icons (those carry `data-icon` and no `src`). */
function pictures(tree: Root): { src: string; alt: string }[] {
  const found: { src: string; alt: string }[] = [];
  const seen = new Set<string>();
  const walk = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      const src = child.properties.src;
      if (child.tagName === "img" && typeof src === "string" && !seen.has(src)) {
        seen.add(src);
        found.push({ src, alt: String(child.properties.alt ?? "") });
      }
      walk(child);
    }
  };
  walk(tree);
  return found;
}

/**
 * The page's pictures as a row of thumbnails above the text, so a reader sees
 * what the page shows before scrolling for it. A press opens the lightbox on
 * that picture, with the rest of the page's behind it.
 */
export function PictureStrip({ tree }: { tree: Root }) {
  const items = useMemo(() => pictures(tree), [tree]);
  if (items.length < MIN) return null;
  return (
    <div className="not-prose -mt-2 mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] print:hidden">
      {items.map((item) => (
        <Thumb key={item.src} {...item} />
      ))}
    </div>
  );
}

function Thumb({ src, alt }: { src: string; alt: string }) {
  // The same ground the picture gets on the page, read the same way.
  const [ground, setGround] = useState<Ground | null>(null);
  return (
    <button
      type="button"
      aria-label={alt || "Open picture"}
      title={alt || undefined}
      className="h-16 max-w-40 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted transition-colors duration-(--duration-fast) pointer-hover:border-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={(event) => openLightbox(event.currentTarget.firstElementChild as HTMLImageElement)}
    >
      <img
        src={assetUrl(src)}
        alt=""
        draggable={false}
        crossOrigin="anonymous"
        onLoad={(event) => setGround(groundFor(event.currentTarget))}
        className={cn("h-full w-auto max-w-full object-contain", ground && ground !== "none" && groundClass(ground))}
      />
    </button>
  );
}
