# Deployment

**Nothing in this branch deploys.** `main` is the desktop app. It ships as a
signed installer, and that pipeline does not exist yet — see
`[[Local — Update Channel and Signing Keys]]` and
`[[Local — Installer and Portable Layout]]` in the spec vault.

Build locally with `bun run app:build`. That writes an installer under
`src-tauri/target/release/bundle/`. It publishes nothing.

## The site still exists

The Next.js site lives on `web`, and releases from `web-prod`. It serves
through the 90-day wind down agreed with SideFX and then stops.

The Cloudflare app is installed on the repo, so a push to `web-prod` runs
`bun run deploy` in Cloudflare CI. **CI is the only place that deploys.** Never
run `bun run deploy` locally: Tailwind's native scanner ships one compiled
binary per operating system, so a local build makes a different CSS content
hash than CI, and that hash sits in the URL of every prerendered page.

Do not merge `main` into `web` or `web-prod`. They are two products now.

## Reading a build

A finished Cloudflare build reports status `stopped`, not `success`. Read the
log to tell a deploy from a failure — look for `Success: Deploy command
completed`, and check that `wrangler` printed a Version ID.
