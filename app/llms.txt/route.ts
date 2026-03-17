export async function GET() {
  const root = process.env.ROOT_URL ?? "https://houdinimd.jchd.me";

  const body = `# HoudiniMD — Houdini Docs for LLMs

HoudiniMD provides SideFX Houdini documentation as clean, LLM-optimised markdown.
All pages are generated on-demand from the official SideFX docs and cached for 30 days.

## Raw Markdown (per-page)

Every rendered page has a raw markdown equivalent at the same URL with \`.md\` appended,
following the llmstxt.org spec:

  ${root}/docs/houdini/nodes/sop/fuse       ← rendered HTML (humans)
  ${root}/docs/houdini/nodes/sop/fuse.md    ← raw markdown  (LLMs)

Pages are generated on first request (~5-10s), then cached. Use \`?regenerate=true\` to force a refresh.

## Search API

GET ${root}/api/search?q={query}

Fuzzy search across all indexed pages. Returns \`docs_url\` (rendered) and \`raw_url\` (markdown).

Parameters:
- q         (required) Search query
- category  (optional) e.g. "VEX Functions", "Nodes > Geometry nodes"
- limit     (optional) Default: 20. Max: 100

Example response:
{
  "results": [
    {
      "path": "houdini/vex/functions/abs",
      "title": "abs",
      "summary": "Returns the absolute value of the argument.",
      "category": "VEX Functions",
      "score": 0.95,
      "docs_url": "${root}/docs/houdini/vex/functions/abs",
      "raw_url":  "${root}/docs/houdini/vex/functions/abs.md"
    }
  ]
}

## Browse Index

GET ${root}/api/index

List all indexed pages. Same \`docs_url\` / \`raw_url\` fields per entry.
Parameters: category, page, limit (max 200).

## Common Path Patterns

| Category       | Raw markdown URL pattern                          |
|----------------|---------------------------------------------------|
| VEX Functions  | /docs/houdini/vex/functions/{name}.md             |
| HOM (Python)   | /docs/houdini/hom/hou/{class}.md                  |
| SOP nodes      | /docs/houdini/nodes/sop/{name}.md                 |
| DOP nodes      | /docs/houdini/nodes/dop/{name}.md                 |
| VOP nodes      | /docs/houdini/nodes/vop/{name}.md                 |

## Recommended Workflow

1. GET ${root}/api/search?q={topic} — find relevant pages
2. Use raw_url from results to fetch raw markdown directly
3. If the path is known, fetch ${root}/docs/houdini/{path}.md directly

## Notes
- No authentication required
- Content mirrors Houdini 20.5–21.0 docs from sidefx.com
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
