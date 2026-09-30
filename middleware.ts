import { NextRequest, NextResponse } from 'next/server';

const HOUDINI_PATH_PREFIXES = [
  'nodes/', 'vex/', 'hom/', 'expressions/', 'model/', 'copy/',
  'crowds/', 'fluids/', 'grains/', 'cloth/', 'pyro/', 'destruction/',
  'shelf/', 'ref/', 'render/', 'solaris/', 'tops/', 'news/',
];

function stripExtensionsAndSlash(p: string): string {
  if (p.endsWith('.html')) return p.slice(0, -5);
  if (p.endsWith('/') && p.length > 1) return p.slice(0, -1);
  return p;
}

/**
 * The old spellings of a doc address, sent to the one the takedown notice is
 * prerendered under. The Worker answers `.md` and agents before this runs
 * (lib/takedown.ts).
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // A pasted SideFX link.
  const sidefxMatch = pathname.match(/^\/https?:\/?\/?(?:www\.)?sidefx\.com\/docs\/(.+)$/);
  if (sidefxMatch) {
    url.pathname = `/docs/${stripExtensionsAndSlash(sidefxMatch[1])}`;
    return NextResponse.redirect(url, 301);
  }

  if (pathname.startsWith('/docs/')) {
    const cleaned = stripExtensionsAndSlash(pathname);
    if (cleaned === pathname) return NextResponse.next();
    url.pathname = cleaned;
    return NextResponse.redirect(url, 301);
  }

  // A Houdini path without its /docs/houdini/ prefix.
  const bare = pathname.slice(1);
  if (HOUDINI_PATH_PREFIXES.some(prefix => bare === prefix.slice(0, -1) || bare.startsWith(prefix))) {
    url.pathname = `/docs/houdini${stripExtensionsAndSlash(pathname)}`;
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
