import { parse } from "node-html-parser";

export interface ScrapedContent {
  title: string;
  summary: string;
  breadcrumbs: string[];
  version: string;
  category: string;
  sourceUrl: string;
  mainHtml: string;
}

export class PageNotFoundError extends Error {
  constructor(url: string, status?: number) {
    super(status ? `Page not found: ${url} (HTTP ${status})` : `Page not found: ${url}`);
    this.name = "PageNotFoundError";
  }
}

const USER_AGENT = "HoudiniMD/1.0 (Documentation Converter; https://houdinimd.jchd.me)";

/**
 * Check if a SideFX documentation page exists by making a HEAD request.
 * Returns true if the page exists (200), throws PageNotFoundError otherwise.
 */
export async function checkPageExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
    });

    if (response.ok) {
      return true;
    }

    throw new PageNotFoundError(url, response.status);
  } catch (error) {
    if (error instanceof PageNotFoundError) {
      throw error;
    }
    // Network error or other issue - try GET as fallback
    // (some servers don't support HEAD requests properly)
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
    });

    if (response.ok) {
      return true;
    }

    throw new PageNotFoundError(url, response.status);
  }
}

/**
 * Scrape a SideFX documentation page using fetch + HTML parsing.
 * No browser/JavaScript required since SideFX docs are static HTML.
 */
export async function scrapeSideFXPage(url: string): Promise<ScrapedContent> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new PageNotFoundError(url, response.status);
  }

  const rawHtml = await response.text();
  // Escape bare << sequences that aren't valid HTML but appear in some SideFX pages
  // (e.g. <<clip = false>> in href attributes), which break node-html-parser
  const html = rawHtml.replace(/<</g, '&lt;&lt;');
  const doc = parse(html);

  // Extract metadata from header/title area
  // The #title div contains the breadcrumbs, h1, and summary for the current page
  const breadcrumbElements = doc.querySelectorAll("#title .ancestors a");
  const breadcrumbs = breadcrumbElements
    .map((el) => el.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Get title text and normalize all internal whitespace to single spaces
  const rawTitle = doc.querySelector("#title h1.title")?.textContent || "";
  const title = rawTitle.replace(/\s+/g, " ").trim();

  const rawSummary = doc.querySelector("#title p.summary")?.textContent || "";
  const summary = rawSummary.replace(/\s+/g, " ").trim();

  // Extract main content HTML
  const mainElement = doc.querySelector("main");
  if (!mainElement) {
    throw new Error("Could not find main content on page");
  }
  const mainHtml = mainElement.innerHTML;

  const version = breadcrumbs[0]?.match(/\d+\.\d+/)?.[0] || "unknown";
  const category = breadcrumbs.slice(1).join(" > ");

  return {
    title,
    summary,
    breadcrumbs,
    version,
    category,
    sourceUrl: url,
    mainHtml,
  };
}
