"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ImageDimensions } from "@/lib/images/dimensions";
import { localIconUrl } from "@/lib/icons";

/**
 * Node/tool icons (icons/ paths) are too many per page to dimension-probe over
 * the network like DocImageClient does for figures — a card-grid page can hold
 * 1000+ of them. A cached image becomes visible before paint. A slow image
 * shows a delayed skeleton, then fades over it. Broken or degenerate (near-0px,
 * e.g. SideFX's 1x1 placeholder) images leave their reserved space in place.
 */
export default function DocIconClient({
  src,
  alt,
  className = "doc-icon",
  priority = false,
  width = 1,
  height = 1,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
} & Partial<ImageDimensions>) {
  const [state, setState] = useState<"loading" | "skeleton" | "instant" | "loaded" | "broken">("loading");
  const ref = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    const img = ref.current;
    if (!img?.complete) return;
    queueMicrotask(() => {
      if (ref.current === img) setState(img.naturalWidth > 1 && img.naturalHeight > 1 ? "instant" : "broken");
    });
  }, [src]);

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = window.setTimeout(() => setState("skeleton"), 150);
    return () => window.clearTimeout(timeout);
  }, [state, src]);

  return (
    <span
      className={`relative inline-grid ${className}`}
      data-doc-icon=""
      data-image-state={state}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {state === "skeleton" && <span className="col-start-1 row-start-1 size-full animate-pulse rounded bg-muted" aria-hidden="true" />}
      {state !== "broken" && (
        <img
          ref={ref}
          src={localIconUrl(src)}
          alt={alt}
          width={width}
          height={height}
          className="col-start-1 row-start-1 size-full object-contain"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          style={{
            // Visible by default so the native <img> can paint as soon as its
            // bytes arrive, without waiting on hydration. Only "skeleton" (a
            // slow load past 150ms, confirmed once JS is running) hides it —
            // that state's own pulse is the placeholder instead.
            opacity: state === "skeleton" ? 0 : 1,
            transition: state === "skeleton" || state === "loaded" ? "opacity 200ms" : undefined,
          }}
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth <= 1 || img.naturalHeight <= 1) return setState("broken");
            setState((current) => current === "skeleton" ? "loaded" : "instant");
          }}
          onError={() => setState("broken")}
        />
      )}
    </span>
  );
}
