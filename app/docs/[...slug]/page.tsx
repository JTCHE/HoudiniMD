import type { Metadata } from "next";
import { DocTakedown } from "@/components/docs/DocTakedown";
import { SITE_NAME } from "@/lib/brand";
import { docPages } from "@/lib/doc-pages";
import { GONE, sidefxUrl } from "@/lib/takedown";

// Every notice is prerendered, and nothing renders at request time: an address
// the build did not know gets the `/docs` notice from the Worker
// (lib/stored-answer.ts).
export const dynamicParams = false;
export const revalidate = false;

export async function generateStaticParams() {
  return [...(await docPages()).keys()].map((path) => ({ slug: path.split("/") }));
}

type Params = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const slug = (await params).slug.join("/");
  return {
    title: `${(await docPages()).get(slug) ?? slug} | ${SITE_NAME}`,
    description: GONE,
    robots: { index: false },
  };
}

export default async function DocsPage({ params }: Params) {
  const slug = (await params).slug.join("/");
  return (
    <DocTakedown
      slug={slug}
      name={(await docPages()).get(slug) ?? slug}
      sourceUrl={sidefxUrl(slug)}
    />
  );
}
