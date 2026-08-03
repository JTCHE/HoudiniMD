"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Node/tool icons (icons/ paths) are too many per page to dimension-probe over
 * the network like DocImageClient does for figures — a card-grid page can hold
 * 1000+ of them. Instead: fade in on load like DocImageClient, and unmount
 * entirely if the icon turns out to be a broken or degenerate (near-0px, e.g.
 * SideFX's 1x1 placeholder) image, rather than showing an empty box for it.
 */
export default function DocIconClient({
  src,
  alt,
  className = "doc-icon",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "broken">("loading");
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (!img?.complete) return;
    setState(img.naturalWidth > 1 && img.naturalHeight > 1 ? "loaded" : "broken");
  }, [src]);

  if (state === "broken") return null;

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      style={{ opacity: state === "loaded" ? 1 : 0, transition: "opacity 200ms" }}
      onLoad={(e) => {
        const img = e.currentTarget;
        setState(img.naturalWidth > 1 && img.naturalHeight > 1 ? "loaded" : "broken");
      }}
      onError={() => setState("broken")}
    />
  );
}
