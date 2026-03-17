import { NextRequest, NextResponse } from "next/server";

const ROOT = process.env.ROOT_URL ?? "https://houdinimd.jchd.me";

// Catch-all for unrecognised paths (e.g. /rbdconstraintsfromrules).
// Searches the index for the best match and redirects there.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const query = slug.join(" ");

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
