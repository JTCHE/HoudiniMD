import { LATEST_HOUDINI_VERSION, currentVersionSlug, legacyVersion } from "@/lib/houdini";

/** Callout markdown (empty string if slugPath is on the current docs root) —
 * a heads-up, not a "this info is wrong" warning, since readers may genuinely
 * be running the older Houdini version this page documents. */
export function legacyWarningMarkdown(slugPath: string): string {
  const version = legacyVersion(slugPath);
  if (!version) return "";
  const currentSlug = currentVersionSlug(slugPath);
  return `> [!NOTE]\n> This page documents Houdini ${version}, no longer the current version. If you're on Houdini ${LATEST_HOUDINI_VERSION}, see the [current page](/docs/${currentSlug}) instead.\n\n`;
}

/** Inserts the legacy-version callout into a full page's markdown, after any
 * frontmatter block so the frontmatter stays parseable from position 0. */
export function insertLegacyWarning(markdown: string, slugPath: string): string {
  const warning = legacyWarningMarkdown(slugPath);
  if (!warning) return markdown;

  if (markdown.startsWith("---")) {
    const end = markdown.indexOf("\n---\n", 3);
    if (end !== -1) {
      const splitAt = end + 5;
      return markdown.slice(0, splitAt) + "\n" + warning + markdown.slice(splitAt);
    }
  }
  return warning + markdown;
}
