import type { HTMLElement } from "node-html-parser";

export interface SphinxMetadata {
  title: string;
  summary: string;
  breadcrumbs: string[];
  version: string;
  category: string;
}

function cleanText(value: string): string {
  return value.replace(/\uf0c1/g, "").replace(/\s+/g, " ").trim();
}

export function isSphinxDocument(doc: HTMLElement, sourceUrl: string): boolean {
  let isApiPath = false;
  try {
    isApiPath = new URL(sourceUrl).pathname.startsWith("/docs/api/");
  } catch {
    return false;
  }

  return isApiPath && !!doc.querySelector('.rst-content div[role="main"].document');
}

export function extractSphinxMetadata(doc: HTMLElement): SphinxMetadata {
  const main = doc.querySelector('.rst-content div[role="main"].document');
  const title = cleanText(
    main?.querySelector("h1")?.textContent
      || doc.querySelectorAll(".wy-breadcrumbs li")[1]?.textContent
      || doc.querySelector("title")?.textContent
      || "",
  );
  const titleHeading = main?.querySelector("h1");
  const summaryNode = titleHeading?.nextElementSibling;
  const summary = summaryNode?.rawTagName === "p" ? cleanText(summaryNode.textContent) : "";
  const product = cleanText(doc.querySelector(".wy-side-nav-search > a")?.textContent || "SideFX Web API");

  return {
    title,
    summary,
    breadcrumbs: [product, title].filter((item, index, items) => item && items.indexOf(item) === index),
    version: "unknown",
    category: product,
  };
}
