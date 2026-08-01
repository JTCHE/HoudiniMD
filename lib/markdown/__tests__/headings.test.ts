import { describe, it, expect } from "bun:test";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { extractHeadings } from "../headings";

const MD = `
<h2 id="subtopics">Subtopics</h2>

<h3 id="shapetab">Shape <code>tab</code></h3>

<h4 id="control-settings">Control settings</h4>

<h3 id="shredding">Shredding</h3>

<h4 id="control-settings">Control settings</h4>

## Reading attributes

Some text.

### Without existence check

\`\`\`vex
## not a heading
\`\`\`

### \`attrib\` and **more**

#### Skipped level

## Reading attributes

## Links to [pages](/docs/vex) and &lt;UDIM&gt;
`;

/** The ids rehypeSlug actually writes, in document order. */
function renderedIds(md: string): string[] {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug);
  const tree = processor.runSync(processor.parse(md)) as {
    children: { type: string; tagName?: string; properties?: { id?: string } }[];
  };
  return tree.children
    .filter((n) => n.type === "element" && /^h[2-6]$/.test(n.tagName ?? ""))
    .map((n) => n.properties?.id ?? "");
}

describe("extractHeadings", () => {
  it("writes the same ids as rehypeSlug, in the same order", () => {
    expect(extractHeadings(MD).map((h) => h.id)).toEqual(renderedIds(MD));
  });

  it("keeps every heading below h1, with readable text", () => {
    const headings = extractHeadings(MD);
    expect(headings.map((h) => h.level)).toContain(4);
    expect(headings.every((h) => h.level > 1)).toBe(true);
    expect(headings.map((h) => h.text)).toContain("attrib and more");
    expect(headings.map((h) => h.text)).toContain("Links to pages and <UDIM>");
  });
});
