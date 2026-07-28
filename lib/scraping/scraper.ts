import { SITE_URL } from "@/lib/site";
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
  /** Node/function/class kind, e.g. "Geometry Node", "VEX function". Empty when the page has no type (e.g. plain articles). */
  nodeType?: string;
}

export class PageNotFoundError extends Error {
  constructor(url: string, status?: number) {
    super(status ? `Page not found: ${url} (HTTP ${status})` : `Page not found: ${url}`);
    this.name = "PageNotFoundError";
  }
}

const USER_AGENT = `HoudiniMD/1.0 (Documentation Converter; ${SITE_URL})`;

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
  // SideFX URL behaviour varies by page type:
  //   section/index pages: trailing slash required — without it, a stale page is served
  //   leaf pages: trailing slash causes 404 — must omit it
  // Always fetch with a trailing slash first (correct for section pages). When that 404s,
  // retry without — handles leaf pages. Keeps toSideFXUrl clean (no slash, canonical display).
  const slashUrl = url.endsWith('/') ? url : `${url}/`;
  let response = await fetch(slashUrl, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    const noSlashUrl = slashUrl.slice(0, -1);
    const retry = await fetch(noSlashUrl, { headers: { "User-Agent": USER_AGENT } });
    if (retry.ok) {
      response = retry;
      url = noSlashUrl;
    } else {
      throw new PageNotFoundError(url, response.status);
    }
  } else {
    url = slashUrl;
  }

  // Use response.url (final URL after any server redirects) as the base for
  // relative-link resolution. SideFX redirects directory URLs like
  // `/docs/houdini` → `/docs/houdini/`, and without the trailing slash a
  // relative link `licensing/index.html` resolves one level too high
  // (to `/docs/licensing/…` instead of `/docs/houdini/licensing/…`).
  // response.url already reflects the redirect destination, so it's always
  // the correct base — no separate probe needed.
  // For section pages url already ends with '/' (we set it to slashUrl above),
  // so use it directly — do not let response.url strip the trailing slash if
  // SideFX happens to serve the directory without a redirect. For leaf pages
  // (no trailing slash on url) prefer response.url to catch server-side
  // redirects to a more specific URL (e.g. /foo/bar → /foo/bar.html).
  const effectiveUrl = url.endsWith('/') ? url : (response.url || url);

  const rawHtml = await response.text();
  // Escape bare << sequences that aren't valid HTML but appear in some SideFX pages
  // (e.g. <<clip = false>> in href attributes), which break node-html-parser
  // Also escape unescaped generic-type markers in APEX node names (e.g. Abs<T>,
  // Add<SrcT, DesT>) — node-html-parser treats <T> as a real (unknown) tag,
  // which corrupts the surrounding <li>/<a> structure for that node and often
  // the ones after it.
  const html = rawHtml
    .replace(/<</g, '&lt;&lt;')
    .replace(/<([A-Z][A-Za-z0-9]*(?:,\s*[A-Z][A-Za-z0-9]*)*)>/g, '&lt;$1&gt;');
  // Lazy-loaded so node-html-parser stays out of the Worker cold-start path;
  // scraping only happens when generating a new (uncached) page.
  const { parse } = await import("node-html-parser");
  const doc = parse(html);

  // Extract metadata from header/title area
  // The #title div contains the breadcrumbs, h1, and summary for the current page
  const breadcrumbElements = doc.querySelectorAll("#title .ancestors a");
  const breadcrumbs = breadcrumbElements
    .map((el) => el.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Get title text and normalize all internal whitespace to single spaces.
  // SideFX splits the name and type into separate elements inside h1.title:
  //   <h1 class="title">Box <span class="subtitle">geometry node</span></h1>
  // The subtitle span is present (but empty) on pages with no type, e.g.
  // plain articles — pull it out first so `title` is name-only.
  const titleH1 = doc.querySelector("#title h1.title");
  const subtitleEl = titleH1?.querySelector(".subtitle");
  const nodeType = subtitleEl?.textContent.replace(/\s+/g, " ").trim() || undefined;
  subtitleEl?.remove();
  const rawTitle = titleH1?.textContent || "";
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
    nodeType,
  };
}
