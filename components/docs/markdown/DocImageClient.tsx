"use client";

import { useEffect, useRef, useState } from "react";

export interface DocImageClientProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Tiny (~8px wide) preview, upscaled and rendered pixelated until the real image lands. */
  blurDataURL?: string;
}

/**
 * The real <img> stays transparent until it has fully decoded, so it never
 * paints top-to-bottom on a slow connection. The preview sits underneath and
 * leaves the DOM the moment the image is ready, so a loaded page never holds
 * two images per figure.
 */
export default function DocImageClient({ src, alt, width, height, blurDataURL }: DocImageClientProps) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // A cached image can finish before hydration, so its load event never fires.
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, [src]);

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
        className="relative block h-full w-full object-cover transition-opacity duration-300 bg-muted"
        // `.prose img` carries a 2em margin. Inside the reserved box that
        // offsets the image and pushes its bottom under overflow-hidden, so
        // the spacing lives on the wrapper (my-4) and the image sits flush.
        style={{ opacity: loaded ? 1 : 0, margin: 0 }}
      />
    </span>
  );
}
