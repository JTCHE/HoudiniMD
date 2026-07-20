import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { fetchIndexEntries } from "@/lib/r2/read";
import { buildOgImageJsx } from "@/lib/og/og-image";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const slugPath = searchParams.get("path") ?? "";
  const slugParts = slugPath.split("/").filter(Boolean);
  const titleParam = searchParams.get("title");
  const summaryParam = searchParams.get("summary");

  let title = titleParam ?? slugParts[slugParts.length - 1]?.replace(/-/g, " ") ?? "HoudiniMD";
  let summary = summaryParam ?? "";
  let category = "";

  // Only fall back to the ~3MB search index (expensive enough to brush the
  // Workers 10ms CPU limit on its own, see lib/r2/read.ts) when the caller
  // didn't already pass title/summary — the docs page has these on hand
  // from its own per-page markdown fetch and passes them directly.
  if (!titleParam) {
    try {
      const entries = await fetchIndexEntries();
      if (entries) {
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
  }

  // ponytail: no @cloudflare/workers-types dep for the `.default` cache typing
  const cache = (caches as unknown as { default: Cache }).default;
  // Cache API only accepts GET requests; Next.js auto-dispatches HEAD to this
  // handler too, so force GET on the cache key regardless of the incoming method.
  const cacheKey = new Request(req.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const breadcrumb = slugParts.slice(0, -1).join(" / ") || undefined;
  const jsx = buildOgImageJsx({
    title,
    summary: summary || undefined,
    category: category || undefined,
    breadcrumb,
  });

  const rendered = new ImageResponse(jsx, { width: 1200, height: 630 });
  const response = new Response(await rendered.arrayBuffer(), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}
