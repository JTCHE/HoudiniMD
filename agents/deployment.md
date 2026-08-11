# Deployment

Never run `bun run deploy` locally.

Deploy with a commit and a push to `main`. The Cloudflare app is installed on
the repo, so a push runs `bun run deploy` in Cloudflare CI.

**CI is the only place that deploys.** `bun run deploy` stops immediately when
`CI` is unset — see `scripts/check-env.ts`.

The reason is the CSS hash. Tailwind's native scanner (`@tailwindcss/oxide`)
and `lightningcss` ship one compiled binary per OS, so a local build makes a
different CSS content hash than CI, even with the same lockfile-pinned
`tailwindcss`. That hash sits in the URL of every prerendered page. A local
deploy therefore re-uploads every `.cache` object in R2, and the next CI deploy
re-uploads them back.

A local `opennextjs-cloudflare build` for `bun run preview` is safe. It never
writes to R2.
