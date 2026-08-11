import type { HTMLElement } from "node-html-parser";

export interface DoxygenMetadata {
  title: string;
  nodeType?: string;
  summary: string;
  breadcrumbs: string[];
  version: string;
  category: string;
}

function cleanText(value: string): string {
  return value
    .replace(/\bMore\.\.\.\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDoxygenDocument(doc: HTMLElement): boolean {
  const generator = doc.querySelector('meta[name="generator"]')?.getAttribute("content") || "";
  return /^Doxygen\b/i.test(generator) && !!doc.querySelector("#doc-content .contents");
}

export function extractDoxygenMetadata(doc: HTMLElement): DoxygenMetadata {
  const documentTitle = cleanText(doc.querySelector("title")?.textContent || "");
  const sourceTitle = cleanText(doc.querySelector(".headertitle .title")?.textContent || "");
  const separator = documentTitle.indexOf(":");
  const product = separator === -1 ? "" : cleanText(documentTitle.slice(0, separator));
  const version = product.match(/\d+\.\d+/)?.[0] || "unknown";
  const typedTitle = sourceTitle.match(/^(.*?)\s+((?:Class|Struct Template|Struct|Union|Namespace|File) Reference)$/);
  const fullTitle = sourceTitle === "Documentation" && product
    ? `${product} Documentation`
    : sourceTitle || cleanText(separator === -1 ? documentTitle : documentTitle.slice(separator + 1));
  const title = typedTitle?.[1] || fullTitle;
  const nodeType = typedTitle?.[2];

  const contents = doc.querySelector("#doc-content .contents");
  const directSummary = contents?.childNodes.find(
    (node) => "rawTagName" in node && node.rawTagName === "p",
  ) as HTMLElement | undefined;

  let summary = cleanText(directSummary?.textContent || "");
  if (/^Go to the source code of this file\.?$/i.test(summary)) summary = "";
  if (!summary && contents) {
    const detailsHeading = contents.querySelectorAll("h2").find(
      (heading) => cleanText(heading.textContent) === "Detailed Description",
    );
    const details = detailsHeading?.nextElementSibling;
    const firstParagraph = details?.rawTagName === "p" ? details : details?.querySelector("p");
    summary = cleanText(firstParagraph?.textContent || "");
  }

  return {
    title,
    nodeType,
    summary,
    breadcrumbs: product ? [product] : [],
    version,
    category: product,
  };
}
