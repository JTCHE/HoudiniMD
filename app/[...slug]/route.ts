import { SITE_URL as ROOT } from "@/lib/site";
import { NextRequest, NextResponse } from "next/server";

// Matches static-asset-shaped paths (stale /_next/static/chunks/*.js references
// after a deploy, favicon requests, etc). These aren't doc-slug lookups — running
// the full-index Fuse search on them just burns CPU for a guaranteed miss, and on
// Workers Free that alone can trip the 10ms limit. Bail out before the fetch.
const NOT_A_SLUG = /^_next\//i;

/**
 * A doc slug is words, digits, `-` and `_`, in up to a few path steps. It
 * never starts a step with `.` or `_`, and it never ends in a file extension.
 *
 * Everything else reaching this route is a scanner: `.env.production`,
 * `_profiler/phpinfo`, `.well-known/traffic-advice`. Each of those used to
 * run a search over the whole index, which is the dearest request the site
 * makes, and one tail showed 95 of them in six hours.
 */
const DOC_SLUG = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i;

// Catch-all for unrecognised paths (e.g. /rbdconstraintsfromrules).
// Searches the index for the best match and redirects there.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const query = slug.join(" ");

  const path = slug.join("/");
  if (NOT_A_SLUG.test(path) || !DOC_SLUG.test(path)) {
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
