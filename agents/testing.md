# Testing

Test your change. Do not commit the test.

Write the smallest check that fails if the logic breaks, run it, read the
result, then delete it. A test written for one change is waste in the tree: it
adds files to read, it goes stale, and nobody runs it again.

Keep a test only if the user asks for it, or if it protects logic that a person
cannot check by hand and that will change again. The `*.test.ts` files beside
`lib/search/ranking.ts` and `lib/videos/dimensions.ts` are that kind.

Scratch scripts, smoke tests, and one-off harnesses go in a temporary
directory, never in the repo.

Prefer a real check over a mock. A page is only confirmed against a running dev
server and a real markdown page from R2.

## Local production test

Test a production build on your machine before you push. A local test is
free. A prod test costs a live deploy, and a bad deploy costs live traffic.

Use this order:

1. Build and run `next build` then `next start`. This is plain Node, no
   Cloudflare code at all. It finds bugs in your own code first.
2. Build and run `bun run preview`. This runs the real Worker code
   (`opennextjs-cloudflare`) inside workerd, the same runtime as production.
   Use this step to find bugs that are specific to the Cloudflare adapter.
3. Only push to `main` once both pass. CI deploys on push — see
   [Deployment](deployment.md).

A `next build` reads `content/index.json` from R2, then fetches every listed
page from R2 to prerender it. On this site, that is near 11,000 reads. Do not
run a full build to test one page.

Cut the page list before you build:

```ts
// TEMP: sliced to N entries for a local test build — DO NOT COMMIT.
return entries.slice(0, 2).map((e) => ({ slug: e.path.split("/") }));
```

Put this inside `generateStaticParams` in
[`app/docs/[...slug]/page.tsx`](../app/docs/%5B...slug%5D/page.tsx). Build and
test. Then revert the cut before you commit — check `git diff` shows only
your real change.

To test a page that is not yet built (a cache miss), request a slug outside
the cut list. Send a real browser user agent and `Accept-Language` header, or
the site treats you as a bot and redirects you to the raw `.md` file instead
of rendering the page:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  -H "Accept-Language: en-US,en;q=0.9" \
  "http://localhost:3000/docs/<a-slug-not-in-your-cut-list>"
```

`.env.local` points `R2_PUBLIC_URL` and `URL` at the real R2 bucket and the
real site. A local build reads real content and can write real content back
(page generation saves to R2). This is expected and safe in small amounts.
Do not run a full site crawl locally — that reads or writes thousands of R2
objects for no reason.

After you deploy, confirm the fix on live traffic, not only on the one page
you tested locally:

1. `wrangler tail houdinimd --format pretty` to watch live requests and
   errors in real time.
2. Query the `views` table in the `houdinimd-analytics` D1 database for
   paths that failed before your fix, across more than one page:
   ```bash
   wrangler d1 execute houdinimd-analytics --remote --command \
     "SELECT path, COUNT(*) AS n FROM views WHERE status = 500 GROUP BY path ORDER BY n DESC LIMIT 20;"
   ```
3. Re-check each of those paths with the same browser-header `curl` above.
4. Load one page in the browser and look at it. A 200 status is not proof
   the page reads — see [Front-end](frontend.md).
