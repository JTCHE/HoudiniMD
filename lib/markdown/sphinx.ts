import type { HTMLElement } from "node-html-parser";

function cleanText(value: string): string {
  return value.replace(/\uf0c1/g, "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeCode(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/^\s*\n/, "")
    .replace(/\s+$/, "");
}

function normalizeCodeBlocks(root: HTMLElement): void {
  for (const wrapper of root.querySelectorAll("div.highlight-python, div.highlight-default")) {
    const pre = wrapper.querySelector("pre");
    if (!pre) continue;
    const code = decodeCode(pre.innerHTML);
    wrapper.replaceWith(
      `<pre data-language="python">${escapeHtml(code)}</pre>`,
    );
  }
}

function normalizeFunctions(root: HTMLElement): void {
  for (const definition of root.querySelectorAll("dl.py.function")) {
    const signatureNode = definition.querySelector("dt.sig");
    if (!signatureNode) continue;

    const signature = cleanText(signatureNode.textContent);
    const qualifiedName = cleanText(
      `${signatureNode.querySelector(".sig-prename")?.textContent || ""}${signatureNode.querySelector(".sig-name")?.textContent || ""}`,
    ).replace(/\(\):?$/, "").replace(/:$/, "");
    const name = qualifiedName || signature.match(/^[^(]+/)?.[0]?.trim() || "Function";
    const id = signatureNode.getAttribute("id");
    const body = definition.querySelector("dd")?.innerHTML || "";
    const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";

    definition.replaceWith(
      `<section><h3 class="sphinx-function"${idAttribute}>${escapeHtml(name)}</h3>`
      + `<pre data-language="python">${escapeHtml(signature)}</pre>`
      + `${body}</section>`,
    );
  }
}

function normalizeDefinitionLists(root: HTMLElement): void {
  for (const list of root.querySelectorAll("dl")) {
    const items: string[] = [];
    const children = list.children;
    for (let index = 0; index < children.length; index++) {
      const term = children[index];
      if (term.rawTagName !== "dt") continue;
      const description = children[index + 1];
      if (description?.rawTagName !== "dd") continue;
      items.push(
        `<li><strong>${escapeHtml(cleanText(term.textContent).replace(/:$/, ""))}</strong> — ${description.innerHTML}</li>`,
      );
      index++;
    }
    if (items.length) list.replaceWith(`<ul>${items.join("")}</ul>`);
  }
}

function normalizeIndexTables(root: HTMLElement): void {
  for (const table of root.querySelectorAll("table.genindextable")) {
    const lists = table.querySelectorAll("td").map((cell) => cell.innerHTML).join("");
    table.replaceWith(lists);
  }
}

function normalizeAdmonitions(root: HTMLElement): void {
  for (const admonition of root.querySelectorAll(".admonition")) {
    const type = (admonition.getAttribute("class") || "")
      .split(/\s+/)
      .find((className) => className !== "admonition") || "note";
    admonition.querySelector(".admonition-title")?.remove();
    const body = admonition.innerHTML;
    admonition.setAttribute("class", `notice ind-item ${type}`);
    admonition.set_content(`<div class="content">${body}</div>`);
  }
}

function normalizeAliasAnchors(root: HTMLElement): void {
  for (const anchor of root.querySelectorAll("span[id]")) {
    anchor.setAttribute("class", "sphinx-anchor");
    anchor.set_content("anchor");
  }
}

function normalizeHeadings(root: HTMLElement): void {
  const pageTitle = root.querySelector("h1");
  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const headerLink = heading.querySelector("a.headerlink");
    const href = headerLink?.getAttribute("href") || "";
    if (!heading.getAttribute("id") && href.startsWith("#")) heading.setAttribute("id", href.slice(1));
    headerLink?.remove();
  }

  pageTitle?.remove();
  for (const heading of root.querySelectorAll("h1")) {
    const id = heading.getAttribute("id");
    heading.replaceWith(`<h2${id ? ` id="${escapeHtml(id)}"` : ""}>${heading.innerHTML}</h2>`);
  }
}

function removeRepeatedSummary(root: HTMLElement, summary: string): void {
  if (!summary) return;
  const firstParagraph = root.querySelector("p");
  if (firstParagraph && cleanText(firstParagraph.textContent) === cleanText(summary)) firstParagraph.remove();
}

export function prepareSphinxRoot(root: HTMLElement, summary: string): void {
  normalizeCodeBlocks(root);
  normalizeFunctions(root);
  normalizeDefinitionLists(root);
  normalizeIndexTables(root);
  normalizeAdmonitions(root);
  normalizeAliasAnchors(root);
  normalizeHeadings(root);
  removeRepeatedSummary(root, summary);
}
