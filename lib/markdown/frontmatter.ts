/** Minimal `key: value` YAML frontmatter reader — the generated docs only ever
 *  emit flat scalar keys (icon, since, …), so no YAML parser is warranted. */
export function parseFrontmatter(md: string): { content: string; data: Record<string, string> } {
  if (!md.startsWith("---")) return { content: md, data: {} };
  const end = md.indexOf("\n---\n", 3);
  if (end === -1) return { content: md, data: {} };
  const data: Record<string, string> = {};
  for (const line of md.slice(3, end).trim().split("\n")) {
    const i = line.indexOf(":");
    if (i > -1) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { content: md.slice(end + 5), data };
}
