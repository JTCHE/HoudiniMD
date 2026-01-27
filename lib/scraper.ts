import launchBrowser from "./scraping/launch-browser";

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

/**
 * Check if a SideFX documentation page exists by making a HEAD request.
 * Returns true if the page exists (200), throws PageNotFoundError otherwise.
 */
export async function checkPageExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "VexLLM/1.0 (Documentation Converter; https://vexllm.dev)",
      },
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
      headers: {
        "User-Agent": "VexLLM/1.0 (Documentation Converter; https://vexllm.dev)",
      },
    });

    if (response.ok) {
      return true;
    }

    throw new PageNotFoundError(url, response.status);
  }
}

export async function scrapeSideFXPage(url: string): Promise<ScrapedContent> {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent: "VexLLM/1.0 (Documentation Converter; https://vexllm.dev)",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for main content to be present
    await page.waitForSelector("main", { timeout: 10000 });

    // Extract metadata from header/title area specifically
    // The #title div contains the breadcrumbs, h1, and summary for the current page
    const rawBreadcrumbs = await page.locator("#title .ancestors a").allTextContents();
    // Clean up whitespace from breadcrumb text
    const breadcrumbs = rawBreadcrumbs.map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean);
    // Get title text and normalize all internal whitespace to single spaces
    const rawTitle = (await page.locator("#title h1.title").textContent()) || "";
    const title = rawTitle.replace(/\s+/g, " ").trim();
    const rawSummary = (await page.locator("#title p.summary").textContent()) || "";
    const summary = rawSummary.replace(/\s+/g, " ").trim();

    // Extract main content HTML
    const mainHtml = await page.locator("main").innerHTML();

    const version = breadcrumbs[0]?.match(/\d+\.\d+/)?.[0] || "unknown";
    const category = breadcrumbs.slice(1).join(" > ");

    return {
      title: title.trim(),
      summary: summary.trim(),
      breadcrumbs,
      version,
      category,
      sourceUrl: url,
      mainHtml,
    };
  } finally {
    await context.close();
  }
}
