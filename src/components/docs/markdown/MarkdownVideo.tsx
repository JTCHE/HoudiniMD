import type { Components } from "react-markdown";
import { imageUrl } from "@/lib/assets";

/** Help videos ship inside the install, so the native player is enough. */
export const Video: Components["video"] = function MarkdownVideo({ src, title }) {
  if (typeof src !== "string") return null;
  return (
    <video
      src={imageUrl(src)}
      title={title}
      className="markdown-media markdown-video my-4 block h-auto w-full"
      controls
      preload="metadata"
    />
  );
};
