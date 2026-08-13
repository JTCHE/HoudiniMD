import { HOUDINI_DOC_VERSIONS } from "@/lib/houdini";
import { SITE_URL } from "@/lib/site";

export async function GET() {
  const body = `# HoudiniMD — SideFX documentation for LLMs

HoudiniMD converts pages from the SideFX documentation site to clean Markdown. It supports the current and archived Houdini documentation trees for ${HOUDINI_DOC_VERSIONS.join(", ")}, including Houdini, HQueue, HDK, Houdini Engine, HAPI, and the application plug-ins.

## Start here

- Documentation catalog: ${SITE_URL}/docs.md
- Search: ${SITE_URL}/api/search?q={query}
- Browse the indexed corpus: ${SITE_URL}/api/index

## Page URLs

Append \`.md\` to a rendered documentation URL to get raw Markdown:

- Rendered page: ${SITE_URL}/docs/houdini/nodes/sop/fuse
- Raw Markdown: ${SITE_URL}/docs/houdini/nodes/sop/fuse.md

A page that is not stored yet is generated from SideFX on its first request and then reused. Add \`?regenerate=true\` to a raw Markdown URL to refresh that page from SideFX.

## Search API

\`GET ${SITE_URL}/api/search?q={query}\`

Search checks exact names and slugs first, then title and slug prefixes, and then the full page content with BM25 ranking. Results can include matching section headings.

Parameters:

- \`q\` (required): Search text. A missing or blank value returns HTTP 400.
- \`category\` (optional): Exact category name, matched without case sensitivity.
- \`limit\` (optional): Number of results from 1 to 100. The default is 20. Invalid values use the default.

The response contains \`query\`, \`total\`, and \`results\`. Each result contains \`path\`, \`title\`, \`summary\`, \`category\`, \`version\`, \`score\`, \`docs_url\`, and \`raw_url\`. A result can also contain \`icon\` and matching \`headings\`, where each heading has \`text\` and \`slug\` fields. \`total\` is the number of results returned, not the number of all possible matches.

Example result:

    {
      "path": "houdini/vex/functions/abs",
      "title": "abs",
      "summary": "Returns the absolute value of the argument.",
      "category": "VEX Functions",
      "version": "22.0",
      "score": 1,
      "docs_url": "${SITE_URL}/docs/houdini/vex/functions/abs",
      "raw_url": "${SITE_URL}/docs/houdini/vex/functions/abs.md"
    }

## Browse API

\`GET ${SITE_URL}/api/index\`

This endpoint lists indexed pages without relevance ranking.

Parameters:

- \`category\` (optional): Exact category name, matched without case sensitivity.
- \`page\` (optional): One-based page number. The default is 1. Invalid values use the default.
- \`limit\` (optional): Entries per page from 1 to 200. The default is 50. Invalid values use the default.

The response contains \`total\`, \`page\`, \`limit\`, \`pages\`, \`categories\`, and \`entries\`. Each entry includes absolute \`docs_url\` and \`raw_url\` fields.

## Recommended workflow

1. Search for the concept with \`/api/search\`.
2. Fetch the result's \`raw_url\`.
3. Use a returned heading slug as a URL fragment when only one section is relevant.
4. Use \`/docs.md\` or \`/api/index\` when you need to browse instead of search.

No authentication is required.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
