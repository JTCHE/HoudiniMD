import { revalidatePath } from "next/cache";
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
 * Resolve a slug to the SideFX URL that actually serves it, trying the two
 * index-page fallback patterns generation already relied on. Throws
 * PageNotFoundError if none of them exist.
 */
export async function resolveSideFXUrl(slug: string): Promise<string> {
  const sideFXUrl = toSideFXUrl(slug);
  try {
    await checkPageExists(sideFXUrl);
    return sideFXUrl;
  } catch (err) {
    if (!(err instanceof PageNotFoundError)) throw err;
    const slugBase = slug.split("#")[0];
    // ponytail: slug ending /index means the file IS index.html, not a subdirectory
    const fallbackUrl = slugBase.endsWith("/index")
      ? `https://www.sidefx.com/docs/${slugBase}.html`
      : `https://www.sidefx.com/docs/${slugBase}/index.html`;
    await checkPageExists(fallbackUrl); // re-throws PageNotFoundError if also missing
    return fallbackUrl;
  }
}

/** Cheap existence check for the HTML route — true if SideFX has this page, false if not. */
export async function slugExistsOnSideFX(slug: string): Promise<boolean> {
  try {
    await resolveSideFXUrl(slug);
    return true;
  } catch (err) {
    if (err instanceof PageNotFoundError) return false;
    throw err;
  }
}

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

  const progress = (stage: ProgressStage, message: string, detail?: string) => {
    onProgress?.({ stage, message, detail });
  };

  // Stage 1: Check cache (unless skipCache is true)
  if (!skipCache) {
    progress("checking-cache", "Checking cache", "Looking for existing content");

    const cachedContent = await fetchFromR2(contentPath);
    if (cachedContent) {
      // The static route may still be pinned to a stale ISR snapshot (e.g. one
      // rendered while this content was momentarily missing) — refresh it so the
      // next visitor gets real content instead of a frozen "generating" page.
      revalidatePath(`/docs/${slug}`);
      progress("complete", "Found in cache", `/docs/${slug}`);
      return { markdown: cachedContent, fromCache: true, slug };
    }
  } else {
    progress("checking-cache", "Skipping cache", "Regenerating content");
  }

  // Stage 2: Verify page exists — try primary URL, then fallbacks for two patterns:
  //   - slug ends with /index (e.g. houdini/chop/index):  try .html extension → index.html
  //   - directory slug (e.g. houdini/nodes/sop):           try /index.html
  progress("verifying", "Verifying page exists", toSideFXUrl(slug));
  const resolvedUrl = await resolveSideFXUrl(slug);

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
    const generatedMarkdown = await convertToMarkdown(scraped, { codeLanguage });

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
        icon: scraped.icon,
      });
    } catch (err) {
      console.error(`Failed to update search index: ${err}`);
    }

    return { content: generatedMarkdown, fromCache: false };
  });

  revalidatePath(`/docs/${slug}`);
  progress("complete", "Generation complete", `/docs/${slug}`);

  return {
    markdown: markdown.content,
    fromCache: markdown.fromCache,
    slug,
  };
}
