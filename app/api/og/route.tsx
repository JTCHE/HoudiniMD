import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { fetchIndexEntries } from "@/lib/r2/read";
import { buildOgImageJsx } from "@/lib/og/og-image";
import { SITE_URL } from "@/lib/site";

// Self-hosted (public/fonts/geist/, MIT-licensed) so satori doesn't depend on
// an external CDN at request time. Fetched once per warm isolate.
let fontsPromise: Promise<{ name: string; data: ArrayBuffer; weight: 300 | 500 | 900; style: "normal" }[]> | null =
  null;
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all(
      ([300, 500, 900] as const).map(async (weight) => {
        const file = { 300: "Light", 500: "Medium", 900: "Black" }[weight];
        const res = await fetch(`${SITE_URL}/fonts/geist/Geist-${file}.ttf`);
        return { name: "Geist", data: await res.arrayBuffer(), weight, style: "normal" as const };
      }),
    );
  }
  return fontsPromise;
}

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

  // The Workers Cache API (`caches.default`) only exists under the Cloudflare
  // runtime — plain `next dev` has no such global. Skip caching there instead
  // of throwing on every request.
  // ponytail: no @cloudflare/workers-types dep for the `.default` cache typing
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : undefined;
  // Cache API only accepts GET requests; Next.js auto-dispatches HEAD to this
  // handler too, so force GET on the cache key regardless of the incoming method.
  const cacheKey = new Request(req.url, { method: "GET" });
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  const iconParam = searchParams.get("icon") || undefined;
  const icon = iconParam ? await resolveIcon(iconParam) : undefined;
  const jsx = buildOgImageJsx({
    title,
    nodeType: searchParams.get("type") || undefined,
    summary: summary || undefined,
    category: category || undefined,
    icon,
  });

  let body: ArrayBuffer;
  try {
    const rendered = new ImageResponse(jsx, { width: 1200, height: 630, fonts: await loadFonts() });
    body = await rendered.arrayBuffer();
  } catch {
    // Generation failed — fall back to the static cover image (don't cache it).
    return Response.redirect(new URL("/cover.png", req.url).toString(), 302);
  }
  const response = new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  await cache?.put(cacheKey, response.clone());
  return response;
}

/**
 * Some scraped icon URLs 404 or redirect to an HTML page (SideFX meta-refresh
 * aliases), and many of the SVGs are legacy Inkscape exports that size
 * themselves with `width`/`height` and no `viewBox` — satori rejects those
 * ("missing viewBox") without throwing, so `ImageResponse` silently paints a
 * blank square that still reserves the icon's layout space.
 *
 * Fetch the icon here instead: give an SVG the `viewBox` it lacks and hand
 * satori a data URI, and drop anything that is not an image so the title can
 * sit flush left.
 */
async function resolveIcon(icon: string): Promise<string | undefined> {
  try {
    const res = await fetch(icon.startsWith("/") ? `${SITE_URL}${icon}` : icon);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !(type.includes("svg") || type.startsWith("image/"))) return undefined;
    if (!type.includes("svg")) return icon;

    const svg = withViewBox(await res.text());
    return svg && `data:image/svg+xml;base64,${toBase64(svg)}`;
  } catch {
    return undefined;
  }
}

/** `btoa` takes latin-1 only, so encode the SVG to UTF-8 bytes first. */
function toBase64(text: string): string {
  let latin1 = "";
  // Chunked — a spread of a whole icon's bytes can overflow the call stack.
  for (const byte of new TextEncoder().encode(text)) latin1 += String.fromCharCode(byte);
  return btoa(latin1);
}

/** Add a `viewBox` from the root `width`/`height` when the SVG has none. */
function withViewBox(svg: string): string | undefined {
  const root = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!root) return undefined;
  if (/\bviewBox=/.test(root)) return svg;

  const size = (attr: string) => Number.parseFloat(root.match(new RegExp(`\\b${attr}="([\\d.]+)`))?.[1] ?? "");
  const [width, height] = [size("width"), size("height")];
  if (!width || !height) return undefined;

  return svg.replace(root, root.replace(/^<svg\b/, `<svg viewBox="0 0 ${width} ${height}"`));
}
