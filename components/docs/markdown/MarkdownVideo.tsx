import type { Components } from "react-markdown";
import type { VideoProbe } from "@/lib/videos/probe";
import DocVideoClient from "./DocVideoClient";

export type VideoMetaMap = Map<string, VideoProbe>;

export function createVideoComponent(metaMap: VideoMetaMap): Components["video"] {
  return function MarkdownVideo({ src, title }) {
    if (typeof src !== "string") return null;
    const meta = metaMap.get(src);
    return (
      <DocVideoClient
        src={src}
        title={title}
        probedRatio={meta ? `${meta.width} / ${meta.height}` : null}
      />
    );
  };
}

/** Default: no probed metadata, same behavior as before this feature existed. */
export const Video: Components["video"] = createVideoComponent(new Map());
