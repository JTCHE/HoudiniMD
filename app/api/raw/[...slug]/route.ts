import { NextRequest } from "next/server";
import { generateMarkdownForSlug, PageNotFoundError } from "@/lib/generator";
import { insertLegacyWarning } from "@/lib/markdown/legacy-warning";
import { toSideFXUrl } from "@/lib/url";
import { SITE_URL } from "@/lib/site";

// Same bar as the HTML 404 page's "Did you mean" — a text-similarity guess
// below this is more likely to mislead than help, so it's left out entirely.
const HIGH_CONFIDENCE = 0.95;

async function suggestionLinks(slugPath: string): Promise<string> {
  const q = slugPath.replace(/\//g, " ");
  try {
    const res = await fetch(`${SITE_URL}/api/search?q=${encodeURIComponent(q)}&limit=5`);
    if (!res.ok) return "";
    const { results } = (await res.json()) as { results: { path: string; title: string; score: number | null }[] };
    const matches = results.filter((r) => (r.score ?? 0) >= HIGH_CONFIDENCE);
    if (!matches.length) return "";
    return `\n\nDid you mean:\n${matches.map((m) => `- [${m.title}](${SITE_URL}/docs/${m.path})`).join("\n")}\n`;
  } catch {
    return "";
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const skipCache = request.nextUrl.searchParams.get("regenerate") === "true";

  try {
    const result = await generateMarkdownForSlug(slugPath, skipCache, (event) => {
      console.log(`[${slugPath}] ${event.stage}: ${event.message}${event.detail ? ` - ${event.detail}` : ""}`);
    });

    return new Response(insertLegacyWarning(result.markdown, slugPath), {
      headers: {
        ...getHeaders(slugPath),
        ...(result.fromCache ? {} : { "X-Generated-At": new Date().toISOString() }),
      },
    });
  } catch (error) {
    console.error(`Failed to generate ${slugPath}:`, error);

    if (error instanceof PageNotFoundError) {
      const suggestions = await suggestionLinks(slugPath);
      return new Response(
        `# Page Not Found\n\nThe documentation page \`${slugPath}\` does not exist on SideFX's website.${suggestions}`,
        { status: 404, headers: { "Content-Type": "text/markdown; charset=utf-8" } }
      );
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      `# Error\n\nFailed to generate \`${slugPath}\`.\n\nError: ${errorMessage}`,
      { status: 500, headers: { "Content-Type": "text/markdown; charset=utf-8" } }
    );
  }
}

function getHeaders(slug: string): HeadersInit {
  return {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=2592000", // 30 days, matches R2 cache TTL
    "X-Content-Type-Options": "nosniff",
    "X-Source-URL": toSideFXUrl(slug),
  };
}
