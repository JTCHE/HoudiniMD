import { NextRequest } from "next/server";
import { generateMarkdownForSlug, PageNotFoundError } from "@/lib/generator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const skipCache = request.nextUrl.searchParams.get("regenerate") === "true";

  try {
    const result = await generateMarkdownForSlug(slugPath, skipCache, (event) => {
      // Log progress for debugging/monitoring
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
        `# Page Not Found\n\nThe documentation page \`${slugPath}\` does not exist on SideFX's website.\n\nPlease verify the URL is correct. You can browse available documentation at:\n- [SideFX Houdini Docs](https://www.sidefx.com/docs/houdini/)\n- [VEX Functions](https://www.sidefx.com/docs/houdini/vex/functions/index.html)`,
        {
          status: 404,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
          },
        }
      );
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      `# Error\n\nFailed to generate documentation for \`${slugPath}\`.\n\nError: ${errorMessage}\n\nPlease try again later or verify the page exists at: https://www.sidefx.com/docs/houdini/${slugPath}.html`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
        },
      }
    );
  }
}

function getHeaders(slug: string): HeadersInit {
  return {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "X-Source-URL": `https://www.sidefx.com/docs/houdini/${slug}.html`,
  };
}
