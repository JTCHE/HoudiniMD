/**
 * A path that names a file the site does not have.
 *
 * Static assets are served before this Worker runs, so a request for a dotted
 * name that arrives here is a request for a file that is not there:
 * `.env.production`, `xmlrpc.php`, `wp-includes/wlwmanifest.xml`,
 * `apple-icon.png`. Each of those used to start the Next server, 870 KB of
 * bootstrap, only to be told 404 — one tail hour measured 606 CPU-ms for a
 * single `POST /xmlrpc.php`.
 *
 * `/docs/` is left out on purpose. A doc slug may carry a dot of its own, as
 * `nodes/sop/polyextrude-2.0` does, and `.md` is the twin of every page.
 */
export function isProbe(pathname: string): boolean {
  for (const owned of ["/docs/", "/api/", "/_next/", "/icons/"]) if (pathname.startsWith(owned)) return false;
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml" || pathname === "/llms.txt") return false;
  if (pathname.endsWith(".md")) return false;
  const segments = pathname.split("/").slice(1);
  // A dot-leading folder is never ours: `/.well-known/traffic-advice`, asked
  // for by Chrome's prefetch proxy, measured 1007 CPU-ms for its 404.
  if (segments.some((segment) => segment.startsWith("."))) return true;
  return (segments.at(-1) ?? "").includes(".");
}
