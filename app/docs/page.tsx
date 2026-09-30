import type { Metadata } from "next";
import { DocTakedown } from "@/components/docs/DocTakedown";
import { DocsPageContent } from "@/components/docs/DocsPageContent";
import { SITE_NAME } from "@/lib/brand";
import { GONE, sidefxUrl } from "@/lib/takedown";

export const metadata: Metadata = {
  title: `Houdini documentation | ${SITE_NAME}`,
  description: GONE,
  robots: { index: false },
};

/** The notice without a page's name. The Worker also gives it for a doc
    address the build did not know. */
export default function DocsRootPage() {
  return (
    <DocsPageContent
      sourceUrl={sidefxUrl("")}
      breadcrumbs={null}
    >
      <DocTakedown
        slug=""
        name="Houdini documentation"
        sourceUrl={sidefxUrl("")}
      />
    </DocsPageContent>
  );
}
