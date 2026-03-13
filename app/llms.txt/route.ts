export async function GET() {
  const root = process.env.ROOT_URL ?? "https://vexllm.jchd.me";

  const body = `# VexLLM — Houdini Docs for LLMs

VexLLM provides SideFX Houdini documentation as clean, LLM-optimised markdown.
All pages are generated on-demand from the official SideFX docs and cached indefinitely.

## API Endpoints

### Search
GET ${root}/api/search?q={query}

Search indexed documentation pages with fuzzy matching.

Parameters:
- q         (required) Search query string
- category  (optional) Filter by category (e.g. "VEX Functions", "HOM", "Nodes")
- limit     (optional) Max results to return. Default: 20. Max: 100

Returns JSON:
{
  "query": "abs",
  "total": 3,
  "results": [
    {
      "path": "houdini/vex/functions/abs",
      "title": "abs",
      "summary": "Returns the absolute value of the argument.",
      "category": "VEX Functions",
      "version": "20.5",
      "score": 0.95,
      "docs_url": "${root}/docs/houdini/vex/functions/abs"
    }
  ]
}

### Browse Index
GET ${root}/api/index

List all indexed documentation pages, paginated.

Parameters:
- category  (optional) Filter by category
- page      (optional) Page number. Default: 1
- limit     (optional) Results per page. Default: 50. Max: 200

Returns JSON with fields: total, page, limit, pages, categories, entries[]

### Fetch Page Content
GET ${root}/docs/{path}

Retrieve the full markdown content of a documentation page.
Pages are generated on first request (~5-10s) then cached forever.

Parameters:
- regenerate=true  (optional) Bypass cache and re-scrape from SideFX

Example: ${root}/docs/houdini/vex/functions/abs

The response is plain markdown (Content-Type: text/markdown).
The X-Source-URL header contains the original SideFX documentation URL.

## Common Path Patterns

| Category       | Path prefix                          | Example                                      |
|----------------|--------------------------------------|----------------------------------------------|
| VEX Functions  | houdini/vex/functions/{name}         | houdini/vex/functions/abs                    |
| VEX Types      | houdini/vex/lang                     | houdini/vex/lang                             |
| HOM (Python)   | houdini/hom/hou/{class}              | houdini/hom/hou/Node                         |
| SOP nodes      | houdini/nodes/sop/{name}             | houdini/nodes/sop/sphere                     |
| DOP nodes      | houdini/nodes/dop/{name}             | houdini/nodes/dop/rbdsolver                  |
| Wrangle/VEX    | houdini/vex/snippets                 | houdini/vex/snippets                         |

## Recommended Agent Workflow

1. Use GET ${root}/api/search?q={topic} to find relevant pages
2. Pick the best match — results[].docs_url is an absolute URL ready to fetch
3. GET that URL to retrieve the full markdown documentation
4. If the exact page path is known, skip search and fetch ${root}/docs/{path} directly

## Notes
- All paths are relative to the SideFX docs root (houdini/ prefix)
- Content is from Houdini 20.5 unless otherwise noted in the version field
- This service does NOT require authentication
- Rate limiting is not enforced but please be reasonable
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
