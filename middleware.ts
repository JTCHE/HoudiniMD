import { NextRequest, NextResponse } from 'next/server';
import { wantsMarkdown } from './lib/wants-markdown';
import { fetchSourceAlias } from './lib/source-aliases';
import { checkDocNamespace } from './lib/url/namespaces';

// Verified renamed/duplicated slugs — exact matches only, never a fuzzy guess.
// Each entry was checked with `curl -L`: the old slug 404s, the new one 200s.
const VERIFIED_SLUG_REDIRECTS: Record<string, string> = {
  'houdini/nodes/sop/sop/copytopoints': 'houdini/nodes/sop/copytopoints',
  'houdini/nodes/top/labs--filecache-2.0': 'houdini/nodes/top/labs--topfilecache-2.0',
};

const HOUDINI_PATH_PREFIXES = [
  'nodes/', 'vex/', 'hom/', 'expressions/', 'model/', 'copy/',
  'crowds/', 'fluids/', 'grains/', 'cloth/', 'pyro/', 'destruction/',
  'shelf/', 'ref/', 'render/', 'solaris/', 'tops/', 'news/',
];

/**
 * A doc tree the mirror does not carry. Answered here rather than by the 404
 * page, because rendering the route is what costs money: OpenNext stores one
 * ISR object per path, and these paths are invented by crawlers without end.
 * `no-store` keeps the answer out of every cache too, so a tree that gets
 * added later starts serving at once.
 */
function notMirrored(slug: string): NextResponse {
  const tree = slug.split('/')[0];
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Not mirrored | HoudiniMD</title>` +
      `<meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      // Values copied from app/globals.css, not linked to it: middleware has no
      // build hash, so a <link> here would break on the next CSS rename.
      `<style>:root{color-scheme:light dark;--bg:oklch(1 0 0);--fg:oklch(0.145 0 0);--muted:oklch(0.556 0 0);--field:oklch(0.97 0 0);--line:oklch(0 0 0/10%)}` +
      `@media(prefers-color-scheme:dark){:root{--bg:oklch(0.145 0 0);--fg:oklch(0.985 0 0);--field:oklch(0.205 0 0);--line:oklch(1 0 0/15%)}}` +
      `body{background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-content:center;padding:2rem 1.5rem;text-align:left}` +
      `main{max-width:34rem}h1{font-size:1.25rem;font-weight:600;margin:0 0 .5rem;letter-spacing:-.01em}` +
      `code{background:var(--field);border:1px solid var(--line);border-radius:.3rem;padding:.1em .35em;font:0.9em ui-monospace,monospace}` +
      `p{margin:0 0 1.25rem;color:var(--muted)}nav{display:flex;gap:.75rem;align-items:center;color:var(--muted)}` +
      `a{color:var(--fg);text-decoration:underline;text-underline-offset:.2em;text-decoration-color:var(--muted)}a:hover{text-decoration-color:currentColor}</style>` +
      `<main><h1>HoudiniMD does not mirror <code>${escapeHtml(tree)}</code></h1>` +
      `<p>This mirror carries the current Houdini, HDK, Houdini Engine and API documentation.</p>` +
      `<nav><a href="/docs">Browse the documentation</a><span>&middot;</span><a href="/">Search</a></nav></main>`,
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

function stripExtensionsAndSlash(p: string): string {
  if (p.endsWith('.html.md')) return p.slice(0, -8);
  if (p.endsWith('.html'))    return p.slice(0, -5);
  if (p.endsWith('/') && p.length > 1) return p.slice(0, -1);
  return p;
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // Handle pasted SideFX URLs — preserve .md suffix so raw markdown is served
  const sidefxMatch = pathname.match(/^\/https?:\/?\/?(?:www\.)?sidefx\.com\/docs\/(.+)$/);
  if (sidefxMatch) {
    let p = sidefxMatch[1];
    const askedForMarkdown = p.endsWith('.html.md') || (p.endsWith('.md') && !p.endsWith('.html'));
    p = stripExtensionsAndSlash(p);
    if (p.endsWith('.md')) p = p.slice(0, -3); // strip bare .md too
    url.pathname = askedForMarkdown ? `/docs/${p}.md` : `/docs/${p}`;
    return NextResponse.redirect(url, 301);
  }

  // /docs/ paths
  if (pathname.startsWith('/docs/')) {
    let bareSlug = pathname.slice('/docs/'.length);
    if (bareSlug.endsWith('.md')) bareSlug = bareSlug.slice(0, -3);
    bareSlug = stripExtensionsAndSlash(bareSlug);

    // Namespace gate. This runs before the alias lookup below because that
    // lookup reads R2, and a path outside the mirror must cost nothing: no R2
    // read, no render, and above all no ISR entry. See lib/url/namespaces.ts
    // for what the two failure answers are protecting against.
    const askedForMarkdown = pathname.endsWith('.md');
    const namespace = checkDocNamespace(bareSlug);
    if (namespace.kind === 'versioned') {
      url.pathname = `/docs/${namespace.slug}${askedForMarkdown ? '.md' : ''}`;
      return NextResponse.redirect(url, 301);
    }
    if (namespace.kind === 'unknown') {
      return notMirrored(bareSlug);
    }

    if (bareSlug in VERIFIED_SLUG_REDIRECTS) {
      url.pathname = `/docs/${VERIFIED_SLUG_REDIRECTS[bareSlug]}`;
      return NextResponse.redirect(url, 301);
    }

    const sourceAlias = await fetchSourceAlias(bareSlug);
    if (sourceAlias && sourceAlias.canonical !== bareSlug) {
      url.pathname = `/docs/${sourceAlias.canonical}${askedForMarkdown ? '.md' : ''}`;
      return NextResponse.redirect(url, 308);
    }

    // .md suffix → rewrite to /api/raw/ (raw markdown for LLMs, per llmstxt.org spec)
    if (pathname.endsWith('.md')) {
      let slug = pathname.slice('/docs/'.length, -3); // strip /docs/ and .md
      if (slug.endsWith('.html')) slug = slug.slice(0, -5); // strip .html residual from .html.md
      url.pathname = `/api/raw/${slug}`;
      return NextResponse.rewrite(url);
    }

    // Strip .html.md and .html, normalise trailing slash
    const cleaned = stripExtensionsAndSlash(pathname);
    if (cleaned !== pathname) {
      url.pathname = cleaned;
      return NextResponse.redirect(url, 301);
    }

    // AI agents / programmatic fetchers → redirect to the .md equivalent so they
    // receive raw markdown instead of the Next.js-rendered HTML. Search and
    // social crawlers fall through to the HTML below.
    if (wantsMarkdown(request.headers.get('user-agent'), request.headers)) {
      url.pathname = `${pathname}.md`;
      return NextResponse.redirect(url, 302);
    }

    // Humans + search/social crawlers: serve the HTML and allow indexing.
    // (canonical points to this HTML URL; the .md twin is advertised via
    // <link rel="alternate" type="text/markdown"> in the page metadata.)
    // Note: Cache-Control for these responses is fixed up in worker.ts, not
    // here — OpenNext's ISR cache-hit path (fixISRHeaders) stamps its own
    // stale-while-revalidate header *after* middleware runs, so anything set
    // on this response object gets overwritten before the client sees it.
    return NextResponse.next();
  }

  // Redirect known Houdini path segments missing the /docs/houdini/ prefix
  const bare = pathname.slice(1);
  if (HOUDINI_PATH_PREFIXES.some(prefix => bare === prefix.slice(0, -1) || bare.startsWith(prefix))) {
    const cleaned = stripExtensionsAndSlash(pathname);
    url.pathname = `/docs/houdini${cleaned}`;
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/docs/:path*',
    '/https\\::path*',
    '/http\\::path*',
    '/nodes/:path*',
    '/vex/:path*',
    '/hom/:path*',
    '/expressions/:path*',
    '/model/:path*',
    '/copy/:path*',
    '/crowds/:path*',
    '/fluids/:path*',
    '/grains/:path*',
    '/cloth/:path*',
    '/pyro/:path*',
    '/destruction/:path*',
    '/shelf/:path*',
    '/ref/:path*',
    '/render/:path*',
    '/solaris/:path*',
    '/tops/:path*',
    '/news/:path*',
  ],
};
