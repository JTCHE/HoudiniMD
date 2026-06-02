import { NextRequest, NextResponse } from 'next/server';
import { LATEST_NEWS_INDEX_SLUGS } from './lib/houdini';

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

// Real browsers always send Mozilla/5.0 alongside a known engine token.
const BROWSER_RE = /Mozilla\/5\.0.+\b(Chrome|Firefox|Safari|Edg|OPR|Vivaldi)\b/;

// Search-engine and social-preview crawlers we WANT to receive the rendered
// HTML (and index it / build link previews). These are NOT redirected to .md.
// AI training/answer bots (GPTBot, ClaudeBot, …) are deliberately absent —
// they're disallowed from /docs/ HTML in robots.ts and steered to .md below.
const HTML_CRAWLER_RE =
  /\b(Googlebot|Storebot-Google|Google-InspectionTool|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Applebot|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|Slackbot)\b/i;

// Programmatic / AI fetchers: not a browser and not a known HTML crawler
// (curl, python-requests, GPTBot, ClaudeBot, …). These get steered to raw .md.
function wantsMarkdown(ua: string | null): boolean {
  if (!ua) return true;
  return !BROWSER_RE.test(ua) && !HTML_CRAWLER_RE.test(ua);
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
    // The latest Houdini version's "What's new" page mirrors the current,
    // unversioned docs root, so send it to our /docs/houdini instead of
    // mirroring a duplicate. Match the bare slug (any .md/.html/slash variant).
    let bareSlug = pathname.slice('/docs/'.length);
    if (bareSlug.endsWith('.md')) bareSlug = bareSlug.slice(0, -3);
    bareSlug = stripExtensionsAndSlash(bareSlug);
    if (LATEST_NEWS_INDEX_SLUGS.includes(bareSlug)) {
      url.pathname = '/docs/houdini';
      return NextResponse.redirect(url, 302);
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
    const ua = request.headers.get('user-agent');
    if (wantsMarkdown(ua)) {
      url.pathname = `${pathname}.md`;
      return NextResponse.redirect(url, 302);
    }

    // Humans + search/social crawlers: serve the HTML and allow indexing.
    // (canonical points to this HTML URL; the .md twin is advertised via
    // <link rel="alternate" type="text/markdown"> in the page metadata.)
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
