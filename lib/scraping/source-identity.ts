import type { ScrapedContent } from "./scraper";

function normalizeIdentityText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeIdentityHtml(value: string): string {
  // HTML whitespace can be significant in preformatted content and attributes.
  // Normalize encoding and line endings only; false negatives are safer than collisions.
  return value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

/** Identity of the parsed source document, before markdown presentation is added. */
export async function sourceFingerprint(
  source: ScrapedContent,
): Promise<string> {
  const identity = JSON.stringify({
    title: normalizeIdentityText(source.title),
    summary: normalizeIdentityText(source.summary),
    mainHtml: normalizeIdentityHtml(source.mainHtml),
    breadcrumbs: source.breadcrumbs.map(normalizeIdentityText),
    version: normalizeIdentityText(source.version),
    category: normalizeIdentityText(source.category),
    since: source.since ? normalizeIdentityText(source.since) : undefined,
    iconSource: source.iconSource?.normalize("NFC"),
    bannerSource: source.bannerSource?.normalize("NFC"),
    deprecation: source.deprecation,
    nodeType: source.nodeType ? normalizeIdentityText(source.nodeType) : undefined,
    renderer: source.renderer,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function comparableMarkdown(markdown: string): string {
  return markdown
    .replace(/^generated_at:\s*.*$/m, "generated_at:")
    .replace(/^source:\s*.*$/m, "source:");
}

/** Source spellings are aliases only when they also produce the same document artifact. */
export function equivalentMarkdownArtifacts(left: string, right: string): boolean {
  return comparableMarkdown(left) === comparableMarkdown(right);
}
