import { scrapeSideFXPage, checkPageExists, PageNotFoundError } from "@/lib/scraping";
import { convertToMarkdown, detectLanguage } from "@/lib/markdown";
import { fetchFromR2, saveToR2, updateSearchIndex } from "@/lib/r2";
import { withLock } from "@/lib/lock-manager";
import { toSideFXUrl } from "@/lib/url";

export type ProgressStage =
  | "checking-cache"
  | "verifying"
  | "scraping"
  | "converting"
  | "saving"
  | "indexing"
  | "complete"
  | "error";

export interface ProgressEvent {
  stage: ProgressStage;
  message: string;
  detail?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface GenerateResult {
  markdown: string;
  fromCache: boolean;
  slug: string;
}

export { PageNotFoundError };

/**
 * Generate markdown for a documentation page.
 * Core logic shared between /api/generate (SSE) and /docs/[...slug] (direct).
 */
export async function generateMarkdownForSlug(
  slug: string,
  skipCache: boolean = false,
  onProgress?: ProgressCallback,
): Promise<GenerateResult> {
  const contentPath = `content/${slug}.md`;
  const sideFXUrl = toSideFXUrl(slug);

  const progress = (stage: ProgressStage, message: string, detail?: string) => {
    onProgress?.({ stage, message, detail });
  };

  // Stage 1: Check cache (unless skipCache is true)
  if (!skipCache) {
    progress("checking-cache", "Checking cache", "Looking for existing content");

    const cachedContent = await fetchFromR2(contentPath);
    if (cachedContent) {
      progress("complete", "Found in cache", `/docs/${slug}`);
      return { markdown: cachedContent, fromCache: true, slug };
    }
  } else {
    progress("checking-cache", "Skipping cache", "Regenerating content");
  }

  // Stage 2: Verify page exists — try primary URL, then /index.html fallback for category pages
  progress("verifying", "Verifying page exists", sideFXUrl);
  let resolvedUrl = sideFXUrl;
  try {
    await checkPageExists(sideFXUrl);
  } catch (err) {
    if (!(err instanceof PageNotFoundError)) throw err;
    // Try index.html variant for directory-style slugs (e.g. houdini/nodes/sop/ → .../sop/index.html)
    const indexUrl = `https://www.sidefx.com/docs/${slug.split("#")[0]}/index.html`;
    await checkPageExists(indexUrl); // re-throws PageNotFoundError if also missing
    resolvedUrl = indexUrl;
  }

  // Stage 3-6: Generate with lock to prevent concurrent generation
  const markdown = await withLock(slug, async () => {
    // Double-check cache after acquiring lock (unless skipCache)
    if (!skipCache) {
      const cachedAfterLock = await fetchFromR2(contentPath);
      if (cachedAfterLock) {
        return { content: cachedAfterLock, fromCache: true };
      }
    }

    // Stage 3: Scrape
    progress("scraping", "Fetching from SideFX", "Scraping page content");
    const scraped = await scrapeSideFXPage(resolvedUrl);

    // Stage 4: Convert
    progress("converting", "Converting to markdown", scraped.title);
    const codeLanguage = detectLanguage(slug);
    const generatedMarkdown = convertToMarkdown(scraped, { codeLanguage });

    // Stage 5: Save to R2
    progress("saving", "Saving to R2", contentPath);
    try {
      await saveToR2(contentPath, generatedMarkdown);
    } catch (err) {
      console.error(`Failed to save to R2: ${err}`);
      // Continue even if save fails
    }

    // Stage 6: Update search index
    progress("indexing", "Updating search index", scraped.title);
    try {
      await updateSearchIndex({
        path: slug,
        title: scraped.title,
        summary: scraped.summary,
        category: scraped.category,
        version: scraped.version,
      });
    } catch (err) {
      console.error(`Failed to update search index: ${err}`);
    }

    return { content: generatedMarkdown, fromCache: false };
  });

  progress("complete", "Generation complete", `/docs/${slug}`);

  return {
    markdown: markdown.content,
    fromCache: markdown.fromCache,
    slug,
  };
}
