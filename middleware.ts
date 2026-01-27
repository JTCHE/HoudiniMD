import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // Only process /docs/* paths
  if (!pathname.startsWith('/docs/')) {
    return NextResponse.next();
  }

  let newPathname = pathname;
  let shouldRedirect = false;

  // Strip .html.md extension (llms.txt standard)
  if (newPathname.endsWith('.html.md')) {
    newPathname = newPathname.slice(0, -8);
    shouldRedirect = true;
  }
  // Strip .html extension
  else if (newPathname.endsWith('.html')) {
    newPathname = newPathname.slice(0, -5);
    shouldRedirect = true;
  }
  // Strip .md extension
  else if (newPathname.endsWith('.md')) {
    newPathname = newPathname.slice(0, -3);
    shouldRedirect = true;
  }

  // Normalize trailing slash (remove it)
  if (newPathname.endsWith('/') && newPathname !== '/') {
    newPathname = newPathname.slice(0, -1);
    shouldRedirect = true;
  }

  if (shouldRedirect) {
    url.pathname = newPathname;
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/docs/:path*',
};
