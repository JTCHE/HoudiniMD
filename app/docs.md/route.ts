import { NextRequest } from "next/server";
import { generateMarkdownForSlug, PageNotFoundError } from "@/lib/generator";
import { SIDEFX_DOCS_ROOT } from "@/lib/houdini";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const skipCache = request.nextUrl.searchParams.get("regenerate") === "true";

  try {
    const result = await generateMarkdownForSlug("", skipCache, (event) => {
      console.log(`[docs root] ${event.stage}: ${event.message}${event.detail ? ` - ${event.detail}` : ""}`);
    });

    return new Response(result.markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=2592000",
        "X-Content-Type-Options": "nosniff",
        "X-Source-URL": `${SIDEFX_DOCS_ROOT}/`,
        ...(result.fromCache ? {} : { "X-Generated-At": new Date().toISOString() }),
      },
    });
  } catch (error) {
    if (error instanceof PageNotFoundError) {
      return new Response("# Page Not Found\n\nThe SideFX documentation root does not exist.", {
        status: 404,
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`# Error\n\nFailed to generate the SideFX documentation root.\n\nError: ${message}`, {
      status: 500,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }
}
