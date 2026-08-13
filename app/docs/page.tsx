import type { Metadata } from "next";
import DocsPage, { generateMetadata as generateDocsMetadata } from "./[...slug]/page";
import { DocsPageContent } from "@/components/docs/DocsPageContent";
import { SIDEFX_DOCS_ROOT } from "@/lib/houdini";

const rootParams = Promise.resolve({ slug: [] as string[] });

export function generateMetadata(): Promise<Metadata> {
  return generateDocsMetadata({ params: rootParams });
}

export default function DocsRootPage() {
  return (
    <DocsPageContent sourceUrl={`${SIDEFX_DOCS_ROOT}/`} breadcrumbs={null}>
      <DocsPage params={rootParams} />
    </DocsPageContent>
  );
}
