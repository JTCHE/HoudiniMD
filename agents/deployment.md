# Deployment

Never run `bun run deploy` locally.

Deploy with a commit and a push to `prod`. The Cloudflare app is installed on
the repo, so a push runs `bun run deploy` in Cloudflare CI.

`main` is the trunk and does not release. A push to `main` runs
`bun run deploy:preview`, which builds and uploads a Worker version but never
promotes it and never writes to R2. Merge `main` into `prod` to release.

A push only builds when it touches a path the build watches. Documentation and
specs are excluded, so a push that changes only `*.md`, `agents/*` or
`.trash/*` does nothing. Three cases ignore the paths and always build: a push
with no file changes, one with 3,000 or more file changes, and one with 20 or
more commits.

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

The hash problem is a local-versus-CI problem only. `deploy:preview` runs in the
same CI image as `deploy`, so it makes the same hash and needs no cache sync.

## Reading a build

A finished build reports status `stopped`, not `success`. Read the log to tell a
deploy from a failure. Look for `Success: Deploy command completed`.

`bun run deploy` runs `cache-sync` before `wrangler deploy`. A non-zero exit from
`cache-sync` stops the deploy, and the build log looks almost finished when that
happens. Check that `wrangler` printed a Version ID before you call a deploy done.
