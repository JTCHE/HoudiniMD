/** Undo the pseudo-tag escaping (`<UDIM>` → `&lt;UDIM&gt;`) for text that is
 *  rendered as a plain string instead of going through ReactMarkdown. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
