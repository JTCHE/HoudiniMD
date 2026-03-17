import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { fetchIndexJson } from "@/lib/r2/read";
import type { SearchIndexEntry } from "@/lib/r2/search-index";
import { buildOgImageJsx } from "@/lib/og/og-image";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const slugPath = searchParams.get("path") ?? "";
  const slugParts = slugPath.split("/").filter(Boolean);

  let title = slugParts[slugParts.length - 1]?.replace(/-/g, " ") ?? "HoudiniMD";
  let summary = "";
  let category = "";

  try {
    const raw = await fetchIndexJson();
    if (raw) {
      const entries: SearchIndexEntry[] = JSON.parse(raw);
      const entry = entries.find((e) => e.path === slugPath);
      if (entry) {
        title = entry.title;
        summary = entry.summary ?? "";
        category = entry.category ?? "";
      }
    }
  } catch {
    // use fallbacks
  }

  const breadcrumb = slugParts.slice(0, -1).join(" / ") || undefined;

  return new ImageResponse(
    buildOgImageJsx({
      title,
      summary: summary || undefined,
      category: category || undefined,
      breadcrumb,
    }),
    { width: 1200, height: 630 }
  );
}
