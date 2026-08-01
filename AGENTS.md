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

Deploys can be achieved in two ways:

1. By comitting and pushing to GitHub. Since the Cloudflare app is installed in the repo, this will trigger an auto deploy.
2. By running `bun run deploy`

# Obsidian Base

When committing/pushing features to Git, and when an issue/feature has explicitely been marked by the user as complete, please verify inside the Obsidian base that the "Status" of the corresponding spec has been set to "Closed".

## Location

Name : HoudiniMD — Issue Tracker.base

Obsidian vault : <value of OBSIDIAN_VAULT_PATH in @.env.obsidian>/side projects/Houdini/HoudiniMD/
