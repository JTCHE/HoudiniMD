# Architecture

A Next.js app on Cloudflare Workers. No documentation content lives in this
repo — the pages come from SideFX and stay in R2.

Four layers.

1. **Edge** — `worker.ts` and `proxy.ts`. The worker wraps the OpenNext
   handler: it serves `/icons/`, static archive assets, and the telemetry
   writes to D1. The proxy normalizes the URL before Next sees it:
   pasted SideFX links, `.html` and `.md` suffixes, verified slug redirects.
2. **Pages** — `app/`. `app/docs/[...slug]/page.tsx` renders a doc page from
   markdown. `app/api/` holds the route handlers. `app/[...slug]/route.ts`
   catches the bare paths.
3. **Domain** — `lib/`. One directory per concern: `scraping/` reads SideFX,
   `markdown/` converts and shapes the markdown, `r2/` reads and writes the
   store, `search/` ranks, `url/` normalizes, `icons`, `images`, `videos`
   resolve the assets. `generator.ts` is the orchestrator that calls them.
4. **Offline** — `scripts/`. No request, no worker. Index builds, cache sync,
   benchmarks, screenshots, and the environment guard.

## The generation flow

`generator.ts` owns it, and it is the one path a page takes:

R2 hit → serve. R2 miss → confirm the page exists on SideFX → scrape → convert
to markdown → save to R2 → update the search index → revalidate.

A lock (`lib/lock-manager.ts`) keeps two requests for the same slug from
scraping twice. Add a stage to the pipeline in `generator.ts`, not in a page or
a route handler.

## Boundaries

- `app/` composes. It does not convert markdown, call SideFX, or rank a result.
- Each `lib/` directory owns one concern and exports through its `index.ts`.
  A new concern gets a new directory, not a longer existing one.
- A slug has one shape. `lib/url/` decides it. Nothing else parses a path.
- `telemetry/` writes. It never changes what the reader gets.
