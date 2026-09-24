import { useState } from "react";
import type { Components } from "react-markdown";
import { assetUrl } from "@/lib/assets";
import { openLightbox } from "@/lib/lightbox";
import { groundClass, groundFor, type Ground } from "@/lib/ground";
import DocIconClient from "./DocIconClient";

/** A figure on a help page. The Rust side resolved the path against the page,
    so this only has to build the URL. An inline `[Icon:TOOLS/handles]` arrives
    here too, as an `<img data-icon>` with no `src` — see `icon` in the
    parser's `markdown.rs` — and `DocIconClient` draws it from `icons.zip`. */
export const Image: Components["img"] = function MarkdownImage({ src, alt, ...props }) {
  const [fill, setFill] = useState(false);
  const [ground, setGround] = useState<Ground | null>(null);
  const data = props as Record<string, unknown>;
  if (typeof data["data-icon"] === "string") {
    return (
      <DocIconClient
        src={`${data["data-icon"]}.svg`}
        alt={alt ?? ""}
        className={`doc-icon inline-icon-${String(data["data-size"] ?? "normal")} mx-0.5`}
      />
    );
  }
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
      // The ground behind a clear picture is chosen from its own marks: see
      // lib/ground. The lightbox reads it off `data-ground`.
      className={`markdown-media my-4 block h-auto max-w-full cursor-zoom-in ${groundClass(ground)}${fill ? " w-full" : ""}`}
      data-ground={ground ?? undefined}
      // The ground is read from the pixels, and the app serves pictures from
      // another origin (`himage:`), which answers with CORS for this.
      crossOrigin="anonymous"
      onClick={(event) => openLightbox(event.currentTarget)}
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
        setGround(groundFor(img));
      }}
    />
  );
};
