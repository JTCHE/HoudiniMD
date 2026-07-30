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

// Legacy fallback for markdown generated before `title:` was a frontmatter
// field — pull the name out of the H1 line instead. No `nodeType` is
// recoverable this way (it was never captured), so tier 1 just equals tier 2
// for old cached pages until they are regenerated.
function extractTitleFromH1(md: string): string {
  const match = md.match(/^#\s+(.+)$/m);
  return match ? match[1] : "";
}

interface Crumb {
  label: string;
  href: string | null;
}

// Keep the last `keep` items. The current page and its nearest ancestors carry
// the useful context, so the root segments are the first to go.
function truncateChain(chain: Crumb[], keep: number): Crumb[] {
  return chain.slice(-keep);
}

function renderChain(items: Crumb[]) {
  return items.map((item, i) => {
    const isLast = i === items.length - 1;
    const sep = !isLast && " > ";
    return (
      <span key={`${item.href ?? item.label}-${i}`}>
        {item.href ? (
          <Link
            href={item.href}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            {item.label}
          </Link>
        ) : (
          item.label
        )}
        {sep}
      </span>
    );
  });
}

export default async function BreadcrumbsAsync({ slug }: { slug: string }) {
  const raw = await fetchFromR2(`content/${slug}.md`);
  if (!raw) return null;
  const data = parseFrontmatterData(raw);
  const title = data.title || extractTitleFromH1(raw);
  const nodeType = data.nodeType || "";

  const rawSegments = data.breadcrumbs ? data.breadcrumbs.split(" > ").filter(Boolean) : [];
  // Collapse consecutive duplicate labels (SideFX index pages emit e.g.
  // "Houdini 21.0 > Houdini 21.0"). Compare trimmed + case-insensitively.
  const parentSegments = rawSegments.filter(
    (label, i) => i === 0 || label.trim().toLowerCase() !== rawSegments[i - 1].trim().toLowerCase(),
  );

  // On index pages the page title repeats the final breadcrumb — drop it so we
  // don't render "… > Houdini 21.0 > Houdini 21.0".
  const lastSegment = parentSegments[parentSegments.length - 1];
  const showTitle =
    !!title && title.trim().toLowerCase() !== (lastSegment ?? "").trim().toLowerCase();

  if (!parentSegments.length && !showTitle) return null;

  const slugParts = slug.split("/");
  const linkChain: Crumb[] = parentSegments.map((label, i) => ({
    label,
    href: `/docs/${slugParts.slice(0, i + 1).join("/")}`,
  }));
  // The current page's own label is never a link. When the title differs from
  // the last ancestor crumb it is appended as a plain-text final item;
  // otherwise the last ancestor link already stands in for it.
  const chain: Crumb[] = showTitle ? [...linkChain, { label: title, href: null }] : linkChain;

  if (chain.length === 0) return null;

  const lastIsTitle = showTitle;
  const withNodeType: Crumb[] =
    lastIsTitle && nodeType
      ? chain.map((c, i) => (i === chain.length - 1 ? { ...c, label: `${c.label} ${nodeType}` } : c))
      : chain;

  const tier1Items = withNodeType; // full path + node type
  const tier2Items = chain; // full path, node type dropped
  const tier3Items = truncateChain(chain, 3); // last 3
  const tier4Items = truncateChain(chain, 2); // parent + current page

  const tier1 = renderChain(tier1Items);
  const tier2 = renderChain(tier2Items);
  const tier3 = renderChain(tier3Items);
  const tier4 = renderChain(tier4Items);

  // Each doc page has a different breadcrumb length, so a fixed container-query
  // breakpoint (e.g. Tailwind's default @xs/@sm/@md) either shows a tier that
  // overflows or hides one that would have fit — the breakpoint must scale with
  // the tier's own text. Container queries can't measure rendered pixel width,
  // so approximate it from character count instead: canvas measureText on real
  // breadcrumb strings at the fixed 12px text-xs size these render in gives
  // 5.4px/char average (ui-sans-serif) — round up to 6 for a safety margin
  // against the tier clipping before its threshold is reached.
  const PX_PER_CHAR = 6;
  const chainWidth = (items: Crumb[]) =>
    PX_PER_CHAR *
    items.reduce((total, item, i) => {
      const sep = i < items.length - 1 ? " > " : "";
      return total + item.label.length + sep.length;
    }, 0);

  const tier1Width = chainWidth(tier1Items);
  const tier2Width = chainWidth(tier2Items);
  const tier3Width = chainWidth(tier3Items);

  return (
    <span className="cursor-default">
      <style>{`
        .bc-t1, .bc-t2, .bc-t3 { display: none; }
        .bc-t4 { display: inline; }
        @container (min-width: ${tier3Width}px) { .bc-t4 { display: none; } .bc-t3 { display: inline; } }
        @container (min-width: ${tier2Width}px) { .bc-t3 { display: none; } .bc-t2 { display: inline; } }
        @container (min-width: ${tier1Width}px) { .bc-t2 { display: none; } .bc-t1 { display: inline; } }
      `}</style>
      <span className="bc-t1">{tier1}</span>
      <span className="bc-t2">{tier2}</span>
      <span className="bc-t3">{tier3}</span>
      <span className="bc-t4">{tier4}</span>
    </span>
  );
}
