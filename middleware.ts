import { NextRequest, NextResponse } from 'next/server';

const HOUDINI_PATH_PREFIXES = [
  'nodes/', 'vex/', 'hom/', 'expressions/', 'model/', 'copy/',
  'crowds/', 'fluids/', 'grains/', 'cloth/', 'pyro/', 'destruction/',
  'shelf/', 'ref/', 'render/', 'solaris/', 'tops/', 'news/',
];

function stripExtensionsAndSlash(p: string): string {
  if (p.endsWith('.html.md')) return p.slice(0, -8);
  if (p.endsWith('.html'))    return p.slice(0, -5);
  if (p.endsWith('/') && p.length > 1) return p.slice(0, -1);
  return p;
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // Handle pasted SideFX URLs — preserve .md suffix so raw markdown is served
  const sidefxMatch = pathname.match(/^\/https?:\/?\/?(?:www\.)?sidefx\.com\/docs\/(.+)$/);
  if (sidefxMatch) {
    let p = sidefxMatch[1];
    const wantsMarkdown = p.endsWith('.html.md') || (p.endsWith('.md') && !p.endsWith('.html'));
    p = stripExtensionsAndSlash(p);
    if (p.endsWith('.md')) p = p.slice(0, -3); // strip bare .md too
    url.pathname = wantsMarkdown ? `/docs/${p}.md` : `/docs/${p}`;
    return NextResponse.redirect(url, 301);
  }

  // /docs/ paths
  if (pathname.startsWith('/docs/')) {
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
