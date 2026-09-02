import type { Components } from "react-markdown";
import { assetUrl } from "@/lib/assets";

/** Help videos ship inside the install, so the native player is enough. */
export const Video: Components["video"] = function MarkdownVideo({ src, title }) {
  if (typeof src !== "string") return null;
  return (
    <video
      src={assetUrl(src)}
      title={title}
      className="markdown-media markdown-video my-4 block h-auto max-w-full"
      controls
      preload="metadata"
    />
  );
};
