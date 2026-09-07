import { useState } from "react";
import type { Components } from "react-markdown";
import { assetUrl } from "@/lib/assets";

/** A figure on a help page. The Rust side resolved the path against the page,
    so this only has to build the URL. An icon does not arrive here — the
    parser keeps icons out of the Markdown and `DocIconClient` draws them. */
export const Image: Components["img"] = function MarkdownImage({ src, alt }) {
  const [fill, setFill] = useState(false);
  if (!src || typeof src !== "string") return null;
  return (
    <img
      src={assetUrl(src)}
      alt={alt ?? ""}
      // A figure that nearly fills the column is meant to fill it: the help
      // ships its diagrams at whatever the writer's window was, and a
      // screenshot 40px short of the text reads as a mistake. A small figure
      // — a single icon, a strip of buttons — keeps its own size, because
      // there is nothing to gain from a diagram blown up four times.
      className={`markdown-media my-4 block h-auto max-w-full${fill ? " w-full" : ""}`}
      // `loading="lazy"` never fires in this app: every doc page scrolls
      // inside its own `overflow-y-auto` shell, not the window, and Chromium's
      // native lazy loader watches the window's viewport only — an image two
      // screens down never crosses its threshold and never loads. Eager is
      // the honest choice, not a stopgap: a doc page carries at most a few
      // dozen pictures, nothing like an endless feed.
      decoding="async"
      onLoad={(event) => {
        const img = event.currentTarget;
        const box = img.parentElement?.clientWidth ?? 0;
        if (box > 0 && img.naturalWidth >= box * 0.6) setFill(true);
      }}
    />
  );
};
