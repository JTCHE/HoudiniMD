import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { scrapeSideFXPage, checkPageExists, PageNotFoundError } from "@/lib/scraper";
import { convertToMarkdown, detectLanguage } from "@/lib/markdown-converter";
import { fetchFromGitHub, saveToGitHub, updateSearchIndex } from "@/lib/git-manager";
import { withLock } from "@/lib/lock-manager";
import { toSideFXUrl } from "@/lib/url-normalizer";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for scraping

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const contentPath = `content/${slugPath}.md`;

  // 1. Check GitHub for recently generated files (not yet in local build)
  try {
    const githubContent = await fetchFromGitHub(contentPath);
    if (githubContent) {
      return new Response(githubContent, {
        headers: getHeaders(slugPath),
      });
    }
  } catch (error) {
    console.error(`GitHub fetch error for ${slugPath}:`, error);
    // Continue to generation if GitHub fetch fails
  }

  // 2. Generate new content with lock to prevent concurrent generation
  try {
    const markdown = await withLock(slugPath, async () => {
      const githubContent = await fetchFromGitHub(contentPath);
      if (githubContent) {
        return githubContent;
      }

      // Validate URL exists before scraping
      const sideFXUrl = toSideFXUrl(slugPath);
      console.log(`Checking if page exists: ${sideFXUrl}`);

      await checkPageExists(sideFXUrl);

      console.log(`Scraping: ${sideFXUrl}`);
      const scraped = await scrapeSideFXPage(sideFXUrl);
      const codeLanguage = detectLanguage(slugPath);
      const generatedMarkdown = convertToMarkdown(scraped, { codeLanguage });

      // Save to GitHub and update search index
      // Must await these in serverless - function terminates after response
      try {
        await saveToGitHub(contentPath, generatedMarkdown);
        console.log(`Saved to GitHub: ${contentPath}`);
      } catch (err) {
        console.error(`Failed to save to GitHub: ${err}`);
      }

      try {
        await updateSearchIndex({
          path: slugPath,
          title: scraped.title,
          summary: scraped.summary,
          category: scraped.category,
          version: scraped.version,
        });
        console.log(`Updated search index for: ${slugPath}`);
      } catch (err) {
        console.error(`Failed to update search index: ${err}`);
      }

      return generatedMarkdown;
    });

    return new Response(markdown, {
      headers: {
        ...getHeaders(slugPath),
        "X-Generated-At": new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(`Failed to generate ${slugPath}:`, error);

    // Handle page not found specifically
    if (error instanceof PageNotFoundError) {
      return new Response(
        `# Page Not Found\n\nThe documentation page \`${slugPath}\` does not exist on SideFX's website.\n\nPlease verify the URL is correct. You can browse available documentation at:\n- [SideFX Houdini Docs](https://www.sidefx.com/docs/houdini/)\n- [VEX Functions](https://www.sidefx.com/docs/houdini/vex/functions/index.html)`,
        {
          status: 404,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
          },
        },
      );
    }

    // Return a helpful error message for other errors
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      `# Error\n\nFailed to generate documentation for \`${slugPath}\`.\n\nError: ${errorMessage}\n\nPlease try again later or verify the page exists at: https://www.sidefx.com/docs/houdini/${slugPath}.html`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
        },
      },
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
