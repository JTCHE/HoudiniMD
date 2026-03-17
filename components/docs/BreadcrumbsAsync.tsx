import { fetchFromR2 } from "@/lib/r2/read";

function parseFrontmatterData(md: string): Record<string, string> {
  if (!md.startsWith("---")) return {};
  const end = md.indexOf("\n---\n", 3);
  if (end === -1) return {};
  const data: Record<string, string> = {};
  for (const line of md.slice(3, end).trim().split("\n")) {
    const i = line.indexOf(":");
    if (i > -1) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return data;
}

function extractTitle(md: string): string {
  const match = md.match(/^#\s+(.+)$/m);
  return match ? match[1] : "";
}

export default async function BreadcrumbsAsync({ slug }: { slug: string }) {
  const raw = await fetchFromR2(`content/${slug}.md`);
  if (!raw) return null;
  const data = parseFrontmatterData(raw);
  const title = extractTitle(raw);
  const breadcrumbs = [data.breadcrumbs, title].filter(Boolean).join(" > ");
  return breadcrumbs ? <>{breadcrumbs}</> : null;
}
