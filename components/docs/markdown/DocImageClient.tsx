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
    // maxWidth pins the box to the image's own width, so a figure narrower
    // than the column is never upscaled — matching how `max-w-full h-auto`
    // rendered it before the box was reserved.
    <span
      className="relative my-4 block max-w-full overflow-hidden"
      style={{ aspectRatio: `${width} / ${height}`, maxWidth: `${width}px` }}
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
        className="relative block h-full w-full object-contain transition-opacity duration-300"
        // `.prose img` carries a 2em margin. Inside the reserved box that
        // offsets the image and pushes its bottom under overflow-hidden, so
        // the spacing lives on the wrapper (my-4) and the image sits flush.
        style={{ opacity: loaded ? 1 : 0, margin: 0 }}
      />
    </span>
  );
}
