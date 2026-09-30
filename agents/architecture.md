# Architecture

A Next.js app on Cloudflare Workers. It is the desktop app's home page. It no
longer serves the Houdini documentation: at SideFX's request, every doc address
answers 410 with a notice — see `lib/takedown.ts`.

Four layers.

1. **Edge** — `worker.ts` and `middleware.ts`. The worker answers every raw doc
   shape in plain text before Next starts, serves the static archive, writes
   the telemetry to D1, and gives each doc page its 410. The middleware
   normalizes a doc URL before Next sees it: pasted SideFX links, `.html` and
   trailing slashes, bare Houdini paths.
2. **Pages** — `app/`. The landing page, the download routes, the privacy
   page, and the doc notice (`app/docs/`), prerendered once per doc address.
3. **Domain** — `lib/`. One file or directory per concern. `doc-pages.ts`
   reads the doc addresses and titles from the index in R2, at build time only.
4. **Offline** — `scripts/`. No request, no worker. Cache sync, screenshots,
   and the environment guard.

## Boundaries

- `app/` composes. It does not decide a status or read R2 at request time.
- A doc page keeps its title and breadcrumbs, nothing more. No SideFX sentence
  goes in a page, a fixture, or a commit.
- `telemetry/` writes. It never changes what the reader gets.
