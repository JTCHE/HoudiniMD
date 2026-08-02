# Project Information

Available at @README.md

# Work Hygiene

- If you need a paragraph-long comment to justify why the workaround is OK, the code is wrong - fix the code.
- Always use ASD-STE100 Simplified Technical English in your writing — either to me, or in commits, PRs, and more

## Visual verification & Testing in WebKit

Always verify your changes using the `Claude Browser` MCP or a similar Browser MCP, not headless CLIs like Curl.

Furthermore, you should always aim to visually verify your changes using the WebKit pipeline :

```bash
node scripts/webkit-shot.ts houdini/nodes/dop/pyrosolver
```

- **`node`, never `bun`** — bun on Windows cannot hold Playwright's stdio pipe,
  so every launch times out.
- Dev server must be up (`bun run dev`)
- Writes `shots/{top,scrolled,open,jumped}.png` at iPhone 14 Pro size. Read the
  PNGs — that is the feedback loop.
- For a one-off check, copy the script, edit it, run it, delete it. Assert with
  `page.evaluate` (counts, rects, `aria-current`) rather than eyeballing.

# Deploys

Deploys are done by comitting and pushing to GitHub. Since the Cloudflare app is installed in the repo, this will trigger an auto deploy.

**Do not run `bun run deploy` from Windows.** Tailwind's native CSS
scanner (`@tailwindcss/oxide`) and `lightningcss` ship a separate
compiled binary per OS. On Windows this produces a different
`@property` fallback block than the Linux binary Cloudflare CI uses,
even with an identical, lockfile-pinned `tailwindcss` version. The
result is a different CSS content hash, which changes the hashed URL
in every prerendered page and forces a full ~11k-page `.cache`
re-upload for zero real content change.

Deploy from Windows by pushing to GitHub instead, so Cloudflare CI
always produces the CSS hash. If you need a local deploy, build from
WSL or a Linux container, not native Windows.

# Obsidian Base

When committing/pushing features to Git, and when an issue/feature has explicitely been marked by the user as complete, please verify inside the Obsidian base that the "Status" of the corresponding spec has been set to "Closed".

## Location

Name : HoudiniMD — Issue Tracker.base

Obsidian vault : <value of OBSIDIAN_VAULT_PATH in @.env.obsidian>/side projects/Houdini/HoudiniMD/
