import { parse } from "node-html-parser";

export interface DeprecationInfo {
  reason?: string;
  version?: string;
}

export interface ScrapedContent {
  title: string;
  summary: string;
  breadcrumbs: string[];
  version: string;
  category: string;
  sourceUrl: string;
  mainHtml: string;
  /** Houdini version the node was introduced in (from the "Since" row of #premeta). */
  since?: string;
  /** Absolute URL of the node's page icon (from .pageicon img). */
  icon?: string;
  /** Present when the page is marked as a deprecated node. */
  deprecation?: DeprecationInfo;
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

  // SideFX section index pages (e.g. .../houdini/news) are directories served
  // without a trailing slash. Their child links (`21/index.html`) only resolve
  // correctly when the base is treated as a directory, so probe the
  // trailing-slash form: if it 200s, use it as the effective source URL so
  // relative-link resolution in the converter keeps the directory segment.
  let effectiveUrl = url;
  if (!url.endsWith("/") && !/\.html?$/i.test(url)) {
    try {
      const probe = await fetch(`${url}/`, {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
      });
      if (probe.ok) effectiveUrl = `${url}/`;
    } catch {
      // Network hiccup — keep file semantics (no trailing slash).
    }
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

  // Extract main content HTML.
  // node-html-parser can misparse certain SideFX index pages, placing body content
  // as direct children of <html> instead of nesting under <main>/<body>. When that
  // happens, parse just the <main> block in isolation — it reliably works there.
  let mainElement = doc.querySelector("main");
  if (!mainElement) {
    const mainStart = html.indexOf("<main");
    const mainEnd = html.lastIndexOf("</main>");
    if (mainStart === -1 || mainEnd === -1) {
      throw new Error("Could not find main content on page");
    }
    const isolatedDoc = parse(html.slice(mainStart, mainEnd + 7));
    mainElement = isolatedDoc.querySelector("main");
    if (!mainElement) {
      throw new Error("Could not find main content on page");
    }
  }
  const mainHtml = mainElement.innerHTML;

  const version = breadcrumbs[0]?.match(/\d+\.\d+/)?.[0] || "unknown";
  const category = breadcrumbs.slice(1).join(" > ");

  // ── Page metadata extracted from the #premeta table / page header ──────────
  // These live outside #content (and #premeta is stripped during conversion),
  // so capture them here from the full document before they are discarded.

  // "Since" version — the first Houdini version the node shipped in.
  let since: string | undefined;
  for (const row of doc.querySelectorAll("#premeta tr")) {
    const label = row.querySelector("td.label")?.textContent.replace(/\s+/g, " ").trim();
    if (label === "Since") {
      const value = row.querySelector("td.content")?.textContent.replace(/\s+/g, " ").trim();
      if (value) since = value;
      break;
    }
  }

  // Page icon — resolve the relative SVG path against the source URL.
  let icon: string | undefined;
  const iconSrc = doc.querySelector(".pageicon img")?.getAttribute("src");
  if (iconSrc) {
    try {
      icon = new URL(iconSrc, effectiveUrl).href;
    } catch {
      icon = iconSrc;
    }
  }

  // Deprecation banner — lives inside #premeta as .node-deprecation-warning.
  let deprecation: DeprecationInfo | undefined;
  const depEl = doc.querySelector(".node-deprecation-warning");
  if (depEl) {
    const reason = depEl
      .querySelector(".node-deprecation-reason")
      ?.textContent.replace(/\s+/g, " ")
      .trim();
    const depVersion = depEl
      .querySelector(".node-deprecation-version")
      ?.textContent.replace(/\s+/g, " ")
      .trim()
      // "(Since version 18.0.)" → "18.0"
      .match(/(\d+\.\d+)/)?.[1];
    deprecation = { reason: reason || undefined, version: depVersion || undefined };
  }

  return {
    title,
    summary,
    breadcrumbs,
    version,
    category,
    sourceUrl: effectiveUrl,
    mainHtml,
    since,
    icon,
    deprecation,
  };
}
