# Project Information

Available at @README.md

# Work Hygiene

- If you need a paragraph-long comment to justify why the workaround is OK, the code is wrong - fix the code.
- Always use ASD-STE100 Simplified Technical English in your writing — either to me, or in commits, PRs, and more
- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Keep one source of truth for each data shape and business rule.
- Put orchestration in indexes. Put one-purpose logic in focused modules.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.

## Visual verification & Testing in WebKit

For UI changes, always verify your changes using the `Claude Browser` MCP or a similar Browser MCP, not headless CLIs like Curl.

Furthermore, to ensure iOS compatibility, you should aim to visually verify your changes using the WebKit pipeline :

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

Deploy by committing and pushing to GitHub. The Cloudflare app is installed in
the repo, so a push to `main` runs `bun run deploy` in Cloudflare CI.

**Cloudflare CI is the only place that deploys.** `bun run deploy` exits
immediately when `CI` is unset (see `scripts/check-env.ts`). Tailwind's native
CSS scanner (`@tailwindcss/oxide`) and `lightningcss` ship a separate compiled
binary per OS, so a local build produces a different CSS content hash than CI
even with an identical, lockfile-pinned `tailwindcss`. That hash sits in the
hashed URL of every prerendered page, so a local deploy re-uploads all ~11k
`.cache` objects (~2.1 GB) and the next CI deploy re-uploads them back.

Local `opennextjs-cloudflare build` for `bun run preview` is fine — it never
writes to R2.

# Obsidian Base

When committing/pushing features to Git, and when an issue/feature has explicitely been marked by the user as complete, please verify inside the Obsidian base that the "Status" of the corresponding spec has been set to "Closed".

## Location

Name : HoudiniMD — Issue Tracker.base

Obsidian vault : <value of OBSIDIAN_VAULT_PATH in @.env.obsidian>/vault/side projects/Houdini/HoudiniMD/
