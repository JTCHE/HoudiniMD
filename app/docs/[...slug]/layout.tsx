import { Suspense } from "react";
import { DocsPageContent } from "@/components/docs/DocsPageContent";
import BreadcrumbsAsync from "@/components/docs/BreadcrumbsAsync";
import { ScrollReset } from "@/components/docs/ScrollReset";
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
  const sourceUrl = toSideFXUrl(slugPath);

  return (
    <DocsPageContent
      sourceUrl={sourceUrl}
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
