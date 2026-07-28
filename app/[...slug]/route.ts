import { SITE_URL as ROOT } from "@/lib/site";
import { NextRequest, NextResponse } from "next/server";

// Matches static-asset-shaped paths (stale /_next/static/chunks/*.js references
// after a deploy, favicon requests, etc). These aren't doc-slug lookups — running
// the full-index Fuse search on them just burns CPU for a guaranteed miss, and on
// Workers Free that alone can trip the 10ms limit. Bail out before the fetch.
const NOT_A_SLUG = /^_next\/|\.[a-z0-9]{1,5}$/i;

// Catch-all for unrecognised paths (e.g. /rbdconstraintsfromrules).
// Searches the index for the best match and redirects there.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const query = slug.join(" ");

  if (NOT_A_SLUG.test(slug.join("/"))) {
    return new Response("Not found", { status: 404 });
  }

  const searchUrl = new URL(`${ROOT}/api/search`);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("limit", "1");

  try {
    const res = await fetch(searchUrl.toString());
    if (res.ok) {
      const data = await res.json();
      if (data.results?.length > 0) {
        return NextResponse.redirect(data.results[0].docs_url, 302);
      }
    }
  } catch {
    // fall through to hint response
  }

  return new Response(
    `No documentation page found for "${query}".\n\nTry searching: ${ROOT}/api/search?q=${encodeURIComponent(query)}\nOr browse the index: ${ROOT}/api/index\nOr read the API guide: ${ROOT}/llms.txt\n`,
    {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }
  );
}
