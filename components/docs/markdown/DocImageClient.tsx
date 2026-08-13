"use client";

import { useCallback, useState } from "react";

export interface DocImageClientProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Tiny (~8px wide) preview, upscaled and rendered pixelated until the real image lands. */
  blurDataURL?: string;
}

/**
 * The preview sits under the image while it loads. The reserved wrapper prevents
 * layout shift, and the browser can paint the real image as soon as pixels arrive.
 */
export default function DocImageClient({ src, alt, width, height, blurDataURL }: DocImageClientProps) {
  const [loaded, setLoaded] = useState(false);

  const ref = useCallback((node: HTMLImageElement | null) => {
    if (!node) return;
    const reveal = () => setLoaded(true);
    node.addEventListener("load", reveal, { once: true });
    if (node.complete && node.naturalWidth > 0) queueMicrotask(reveal);
  }, []);

  return (
    <span
      className="markdown-media relative my-4 block"
      style={{
        aspectRatio: `${width} / ${height}`,
        maxWidth: width > height ? undefined : `min(100%, ${width}px)`,
        marginInline: width > height ? undefined : "auto",
      }}
    >
      {!loaded &&
        (blurDataURL ? (
          <span
            aria-hidden="true"
            className="absolute inset-0 block bg-cover bg-center"
            style={{ backgroundImage: `url(${blurDataURL})`, imageRendering: "pixelated" }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 block animate-pulse bg-muted"
          />
        ))}
      {/* eslint-disable-next-line @next/next/no-img-element -- needs a raw <img> to track cached/load state directly. */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className="relative block h-full w-full object-cover bg-muted"
        // `.prose img` carries a 2em margin. Inside the reserved box that
        // offsets the image and pushes its bottom under overflow-hidden, so
        // the spacing lives on the wrapper (my-4) and the image sits flush.
        style={{ margin: 0 }}
      />
    </span>
  );
}
