import { Suspense } from "react";
import { DocsPageContent } from "@/components/docs/DocsPageContent";
import BreadcrumbsAsync from "@/components/docs/BreadcrumbsAsync";
import { ScrollReset } from "@/components/docs/ScrollReset";
import { fetchFromR2 } from "@/lib/r2/read";
import { toSideFXUrl } from "@/lib/url";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const slugPath = slug.join("/");

  // Use the `source:` field from the stored markdown as the canonical SideFX URL.
  // The scraper sets this to the effective URL after following redirects, including
  // trailing slashes for section/index pages (e.g. houdini/nodes → nodes/).
  // Falls back to toSideFXUrl() while the page is still being generated.
  const raw = await fetchFromR2(`content/${slugPath}.md`);
  const sourceUrl = raw?.match(/\nsource:\s*(\S+)/)?.[1] ?? toSideFXUrl(slugPath);

  const markdownUrl = `/docs/${slugPath}.md`;

  return (
    <DocsPageContent
      sourceUrl={sourceUrl}
      markdownUrl={markdownUrl}
      breadcrumbs={
        <Suspense fallback={<span className="sk bg-muted inline-block h-3 w-44" />}>
          <BreadcrumbsAsync slug={slugPath} />
        </Suspense>
      }
    >
      <ScrollReset />
      {children}
    </DocsPageContent>
  );
}
