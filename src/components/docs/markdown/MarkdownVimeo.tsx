import { useState } from "react";
import { Icons } from "@/lib/ui/icons";

/** A Vimeo clip the help page embeds — `vimeo` in the parser's `markdown.rs`.
    The player comes from vimeo.com, so it loads only when the reader presses
    play: a page read offline, or read without the clip, sends no request.
    `dnt=1` asks Vimeo not to track the viewer. */
export function Vimeo({ id, title }: { id: string; title?: string }) {
  const [playing, setPlaying] = useState(false);
  const clip = id.replace(/\D/g, "");
  if (!clip) return null;
  return (
    <div className="markdown-media relative my-4 bg-muted" style={{ aspectRatio: "16 / 9" }}>
      {playing ? (
        <iframe
          src={`https://player.vimeo.com/video/${clip}?autoplay=1&dnt=1`}
          title={title || "Vimeo video"}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className={
            "absolute inset-0 flex cursor-interactive flex-col items-center justify-center gap-2 " +
            "text-muted-foreground transition-colors duration-(--duration-fast) motion-reduce:transition-none " +
            "pointer-hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          }
        >
          <Icons.play className="size-8" />
          <span className="text-sm">{title ? `${title} — Vimeo` : "Play on Vimeo"}</span>
        </button>
      )}
    </div>
  );
}
