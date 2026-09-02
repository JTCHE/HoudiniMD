import type { Components } from "react-markdown";
import { assetUrl } from "@/lib/assets";
import DocVideoClient from "./DocVideoClient";

/** The clip is a file in the install, so only the URL has to be built. */
export const Video: Components["video"] = function MarkdownVideo({ src, title }) {
  if (typeof src !== "string") return null;
  return <DocVideoClient src={assetUrl(src)} title={title} />;
};
