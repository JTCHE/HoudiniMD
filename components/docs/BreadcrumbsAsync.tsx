import Link from "next/link";
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

  const parentSegments = data.breadcrumbs ? data.breadcrumbs.split(" > ").filter(Boolean) : [];

  if (!parentSegments.length && !title) return null;

  const slugParts = slug.split("/");

  return (
    <span className="cursor-default">
      {parentSegments.map((label, i) => {
        const targetSlug = slugParts.slice(0, i + 1).join("/");
        return (
          <span key={targetSlug}>
            <Link
              href={`/docs/${targetSlug}`}
              className="hover:text-foreground transition-colors cursor-pointer"
            >
              {label}
            </Link>
            {" > "}
          </span>
        );
      })}
      {title && <span>{title}</span>}
    </span>
  );
}
