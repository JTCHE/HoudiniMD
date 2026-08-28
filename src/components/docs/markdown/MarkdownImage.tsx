import type { Components } from "react-markdown";
import { imageUrl } from "@/lib/assets";
import DocIconClient from "./DocIconClient";

/**
 * Inline SideFX icons render at text size (.doc-icon); everything else is a
 * block figure. Both come out of the zips in the Houdini install.
 */
export const Image: Components["img"] = function MarkdownImage({ src, alt }) {
  if (!src || typeof src !== "string") return null;
  if (/icons\//.test(src)) return <DocIconClient src={src} alt={alt ?? ""} />;
  return (
    <img
      src={imageUrl(src)}
      alt={alt ?? ""}
      className="markdown-media my-4 block h-auto w-full"
      loading="lazy"
      decoding="async"
    />
  );
};
