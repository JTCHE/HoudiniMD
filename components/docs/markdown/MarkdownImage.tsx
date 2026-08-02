import type { Components } from "react-markdown";
import type { ImageProbe } from "@/lib/images/probe";
import DocImageClient from "./DocImageClient";
import DocIconClient from "./DocIconClient";

export type ImageMetaMap = Map<string, ImageProbe>;

/**
 * Inline SideFX icons render at text size (.doc-icon); everything else is a
 * block figure whose space is reserved up front from probed dimensions, so
 * the layout never shifts once the image loads.
 */
export function createImageComponent(metaMap: ImageMetaMap): Components["img"] {
  return function MarkdownImage({ src, alt }) {
    if (!src || typeof src !== "string") return null;
    if (/icons\//.test(src)) {
      return <DocIconClient src={src} alt={alt ?? ""} />;
    }

    const meta = metaMap.get(src);
    if (!meta) {
      // Degenerate case: probing failed or was skipped (e.g. page has more
      // images than the probe cap). Render exactly as before the feature —
      // no reserved space, but never a broken image.
      return <img src={src} alt={alt ?? ""} className="max-w-full h-auto my-4 block" />;
    }

    return (
      <DocImageClient
        src={src}
        alt={alt ?? ""}
        width={meta.width}
        height={meta.height}
        blurDataURL={meta.placeholder ?? undefined}
      />
    );
  };
}

/** Default: no probed metadata, same behavior as before this feature existed. */
export const Image: Components["img"] = createImageComponent(new Map());
