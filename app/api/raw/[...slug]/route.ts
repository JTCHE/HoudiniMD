import { NextRequest } from "next/server";
import { generateMarkdownForSlug, PageNotFoundError } from "@/lib/generator";
import { toSideFXUrl } from "@/lib/url";

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

    return new Response(result.markdown, {
      headers: {
        ...getHeaders(slugPath),
        ...(result.fromCache ? {} : { "X-Generated-At": new Date().toISOString() }),
      },
    });
  } catch (error) {
    console.error(`Failed to generate ${slugPath}:`, error);

    if (error instanceof PageNotFoundError) {
      return new Response(
        `# Page Not Found\n\nThe documentation page \`${slugPath}\` does not exist on SideFX's website.`,
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
