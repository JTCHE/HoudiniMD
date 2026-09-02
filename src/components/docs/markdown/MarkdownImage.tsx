import type { Components } from "react-markdown";
import { assetUrl } from "@/lib/assets";

/** A figure on a help page. The Rust side resolved the path against the page,
    so this only has to build the URL. An icon does not arrive here — the
    parser keeps icons out of the Markdown and `DocIconClient` draws them. */
export const Image: Components["img"] = function MarkdownImage({ src, alt }) {
  if (!src || typeof src !== "string") return null;
  return (
    <img
      src={assetUrl(src)}
      alt={alt ?? ""}
      className="markdown-media my-4 block h-auto max-w-full"
      loading="lazy"
      decoding="async"
    />
  );
};
