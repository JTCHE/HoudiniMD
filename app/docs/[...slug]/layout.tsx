import { Breadcrumbs } from "@/components/docs/Breadcrumbs";
import { DocsPageContent } from "@/components/docs/DocsPageContent";
import { crumbsFor, docPages } from "@/lib/doc-pages";
import { sidefxUrl } from "@/lib/takedown";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string[] }>;
}) {
  const slug = (await params).slug.join("/");
  return (
    <DocsPageContent
      sourceUrl={sidefxUrl(slug)}
      breadcrumbs={<Breadcrumbs chain={crumbsFor(slug, await docPages())} />}
    >
      {children}
    </DocsPageContent>
  );
}
