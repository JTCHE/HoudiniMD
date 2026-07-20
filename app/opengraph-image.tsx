import { ImageResponse } from "next/og";
import { buildOgImageJsx } from "@/lib/og/og-image";

const SITE_URL = process.env.URL || "https://houdinimd.jchd.me";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 604800; // 7 days

export default function Image() {
  try {
    return new ImageResponse(
      buildOgImageJsx({
        title: "HoudiniMD",
        subtitle: "Houdini documentation optimized for AI and LLMs",
        tags: ["VEX Functions", "Python / HOM", "Nodes", "Expressions"],
      }),
      { ...size }
    );
  } catch {
    // Generation failed — fall back to the static cover image.
    return Response.redirect(`${SITE_URL}/cover.png`, 302);
  }
}
