import type { HTMLElement } from "node-html-parser";

function cleanText(value: string): string {
  return value
    .replace(/\bMore\.\.\./gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function previousElement(node: HTMLElement): HTMLElement | null {
  return node.previousElementSibling;
}

function memberAnchor(member: HTMLElement): string {
  const anchor = previousElement(member);
  return anchor?.classList.contains("anchor") ? anchor.getAttribute("id") || "" : "";
}

function fallbackMemberName(signature: string): string {
  const callable = signature.match(/(?:^|\s)((?:operator\s*[^\s(]+)|[~\w:]+)\s*\(/);
  if (callable) return callable[1].replace(/\s*\($/, "");
  return signature.match(/([~\w:]+)\s*$/)?.[1] || signature;
}

function normalizeSignature(proto: HTMLElement): string {
  return cleanText(proto.textContent)
    .replace(/\s+([,;)])/g, "$1")
    .replace(/\s+\(/g, "(")
    .replace(/\(\s+/g, "(")
    .replace(/([*&])\s+(?=[A-Za-z_])/g, "$1");
}

function detailedMemberNames(root: HTMLElement): Map<string, string> {
  const names = new Map<string, string>();
  for (const table of root.querySelectorAll("table.memberdecls")) {
    for (const row of table.querySelectorAll("tr")) {
      const id = (row.getAttribute("class") || "").match(/(?:^|\s)memitem:([^\s]+)/)?.[1];
      if (!id) continue;
      const link = row.querySelectorAll("a").find((item) => item.getAttribute("href")?.endsWith(`#${id}`));
      const name = cleanText(link?.textContent || "");
      if (name) names.set(id, name);
    }
  }
  return names;
}

function normalizeMemberDeclarations(root: HTMLElement): void {
  for (const table of root.querySelectorAll("table.memberdecls")) {
    const rows = table.querySelectorAll("tr");
    const heading = cleanText(rows.find((row) => row.classList.contains("heading"))?.textContent || "Members");
    const items: Array<{ type: string; declaration: string; description: string }> = [];
    for (const row of rows) {
      const classes = row.getAttribute("class") || "";
      if (/(?:^|\s)memitem:/.test(classes)) {
        const cells = row.querySelectorAll("td");
        const type = cleanText(cells[0]?.textContent || "");
        const declaration = cleanText(cells[1]?.textContent || row.textContent);
        if (declaration) items.push({ type, declaration, description: "" });
        continue;
      }
      if (/(?:^|\s)memdesc:/.test(classes) && items.length > 0) {
        items[items.length - 1].description = cleanText(row.textContent);
      }
    }

    if (items.length === 0) {
      table.remove();
      continue;
    }
    const hasDescriptions = items.some((item) => item.description);
    const headers = hasDescriptions
      ? "<th>Type</th><th>Declaration</th><th>Description</th>"
      : "<th>Type</th><th>Declaration</th>";
    const body = items.map((item) => (
      `<tr><td><code>${escapeHtml(item.type)}</code></td><td><code>${escapeHtml(item.declaration)}</code></td>`
      + `${hasDescriptions ? `<td>${escapeHtml(item.description)}</td>` : ""}</tr>`
    )).join("");
    table.replaceWith(
      `<h2>${escapeHtml(heading)}</h2><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`,
    );
  }
}

function normalizeDynamicGraphs(root: HTMLElement): void {
  for (const header of root.querySelectorAll(".dynheader")) {
    const sectionId = header.getAttribute("id") || "";
    const content = sectionId ? root.querySelector(`#${sectionId}-content`) : undefined;
    const image = content?.querySelector("img[src]");
    if (!image) continue;

    const label = cleanText(header.textContent);
    const source = image.getAttribute("src") || "";
    header.replaceWith(
      `<figure><img src="${escapeHtml(source)}" alt="${escapeHtml(label)}">`
      + `<figcaption>${escapeHtml(label)}</figcaption></figure>`,
    );
    root.querySelector(`#${sectionId}-summary`)?.remove();
    content?.remove();
  }
}

function normalizeDetailedMembers(root: HTMLElement, names: ReadonlyMap<string, string>): void {
  for (const member of root.querySelectorAll("div.memitem")) {
    const proto = member.querySelector(".memproto");
    if (!proto) continue;
    const id = memberAnchor(member);
    const signature = normalizeSignature(proto);
    if (!signature) {
      proto.remove();
      continue;
    }
    const name = names.get(id) || fallbackMemberName(signature);
    const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
    proto.replaceWith(
      `<h3 class="doxygen-member"${idAttribute}>${escapeHtml(name)}</h3><pre><code class="language-cpp">${escapeHtml(signature)}</code></pre>`,
    );
  }
}

function normalizeParameterSections(root: HTMLElement): void {
  for (const list of root.querySelectorAll("dl")) {
    const title = cleanText(list.querySelector("dt")?.textContent || "Details");
    const body = list.querySelector("dd")?.innerHTML || "";
    list.set_content(`<h4>${escapeHtml(title)}</h4>${body}`);
  }

  for (const table of root.querySelectorAll("table.params")) {
    const columnCount = table.querySelector("tr")?.querySelectorAll("td").length || 0;
    const labels = columnCount >= 3
      ? ["Direction", "Name", "Description"]
      : ["Name", "Description"].slice(0, columnCount);
    if (labels.length === 0) continue;
    table.insertAdjacentHTML(
      "afterbegin",
      `<thead><tr>${labels.map((label) => `<th>${label}</th>`).join("")}</tr></thead>`,
    );
  }
}

function normalizeSourceFragments(root: HTMLElement): void {
  for (const fragment of root.querySelectorAll("div.fragment")) {
    const lines = fragment.querySelectorAll("div.line").map((line) => {
      line.querySelectorAll(".lineno").forEach((number) => number.remove());
      return line.textContent.replace(/\u00a0/g, " ").replace(/\s+$/g, "");
    });
    if (lines.length === 0) continue;
    fragment.replaceWith(`<pre><code class="language-cpp">${escapeHtml(lines.join("\n"))}</code></pre>`);
  }
}

function normalizeDirectories(root: HTMLElement): void {
  for (const directory of root.querySelectorAll("div.directory")) {
    const items = directory.querySelectorAll("table.directory tr").map((row) => {
      const link = row.querySelector("td.entry a.el");
      if (!link) return "";
      const description = row.querySelector("td.desc")?.innerHTML.trim() || "";
      return `<li>${link.outerHTML}${description ? ` - ${description}` : ""}</li>`;
    }).filter(Boolean);
    if (items.length === 0) {
      directory.remove();
      continue;
    }
    directory.replaceWith(`<ul>${items.join("")}</ul>`);
  }
}

function removeRepeatedSummary(root: HTMLElement, summary: string): void {
  if (!summary) return;
  const expected = cleanText(summary);
  for (const child of [...root.childNodes]) {
    if (!("rawTagName" in child) || child.rawTagName !== "p") continue;
    if (cleanText(child.textContent) === expected) child.remove();
    break;
  }

  const heading = root.querySelectorAll("h2").find(
    (item) => cleanText(item.textContent) === "Detailed Description",
  );
  if (!heading) return;
  const detail = heading.nextElementSibling;
  if (detail && cleanText(detail.textContent) === expected) {
    detail.remove();
    heading.remove();
  }
}

export function prepareDoxygenRoot(root: HTMLElement, summary: string): void {
  const names = detailedMemberNames(root);
  normalizeMemberDeclarations(root);
  normalizeDetailedMembers(root, names);
  normalizeParameterSections(root);
  normalizeSourceFragments(root);
  normalizeDirectories(root);
  normalizeDynamicGraphs(root);

  root.querySelectorAll(".dynheader, .dynsummary, .dyncontent, .memSeparator, .permalink, .icona, .arrow").forEach((item) => item.remove());
  root.querySelectorAll("p").forEach((paragraph) => {
    if (/^(?:Definition at line|Referenced by|References)\b/i.test(cleanText(paragraph.textContent))) {
      paragraph.remove();
    }
  });
  removeRepeatedSummary(root, summary);
  root.querySelectorAll("h2").forEach((heading) => {
    if (cleanText(heading.textContent) !== "Detailed Description") return;
    const next = heading.nextElementSibling;
    if (!next || /^h[1-6]$/.test(next.rawTagName)) heading.remove();
  });

  root.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (/^javascript:/i.test(href) || cleanText(link.textContent) === "More...") link.remove();
  });

  root.querySelectorAll("h1").forEach((heading) => {
    const id = heading.getAttribute("id");
    heading.replaceWith(`<h2${id ? ` id="${escapeHtml(id)}"` : ""}>${heading.innerHTML}</h2>`);
  });
  root.querySelectorAll("h2, h3, h4, h5, h6").forEach((heading) => {
    const anchor = heading.querySelector("a[id], a[name]");
    const id = heading.getAttribute("id") || anchor?.getAttribute("id") || anchor?.getAttribute("name");
    if (id) heading.setAttribute("id", id);
    anchor?.remove();
  });
}
