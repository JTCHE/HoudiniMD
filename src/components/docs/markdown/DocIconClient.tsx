"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { localIconUrl } from "@/lib/icons";

/**
 * Node/tool icons come from `icons.zip` through the `hicon` protocol. A cached
 * image becomes visible before paint. A slow image shows a delayed skeleton,
 * then fades over it. An icon the zip does not hold renders nothing at all —
 * no reserved box.
 *
 * Intrinsic size means nothing here: many SideFX icons carry a `viewBox` and no
 * `width`, so the webview reports a natural size of 0. Only a load error marks
 * an icon broken.
 */
export default function DocIconClient({
  src,
  alt,
  className = "doc-icon mr-2",
  priority = false,
  width = 1,
  height = 1,
  fallback = null,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  /** Drawn in place of an icon the install does not ship. A list gives the
      page glyph here, so a row whose icon is missing keeps its column; prose
      gives nothing, where a box the size of an icon would be a hole. */
  fallback?: React.ReactNode;
} & { width?: number; height?: number }) {
  const [state, setState] = useState<"loading" | "skeleton" | "instant" | "loaded" | "broken">("loading");
  const ref = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    const img = ref.current;
    if (!img?.complete) return;
    queueMicrotask(() => {
      if (ref.current === img) setState("instant");
    });
  }, [src]);

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = window.setTimeout(() => setState("skeleton"), 150);
    return () => window.clearTimeout(timeout);
  }, [state, src]);

  // A missing icon draws what the caller says stands in for it, and nothing
  // when the caller says nothing.
  if (state === "broken") return <>{fallback}</>;

  return (
    <span
      className={`relative inline-grid ${className}`}
      data-doc-icon=""
      data-image-state={state}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {state === "skeleton" && (
        <span
          className="col-start-1 row-start-1 size-full animate-pulse rounded bg-muted"
          aria-hidden="true"
        />
      )}
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
        onLoad={() => {
          setState((current) => (current === "skeleton" ? "loaded" : "instant"));
        }}
        onError={() => setState("broken")}
      />
    </span>
  );
}
