@AGENTS.md

# Work Hygiene

- Always verify your changes using the `Claude Browser` MCP, not headless CLIs like Curl.

## Testing in WebKit (iOS bugs)

Chromium lies about `backdrop-filter` and `scroll-margin`. Anything that looks
wrong on John's iPhone, reproduce here first.

```bash
node scripts/shot.ts houdini/nodes/dop/pyrosolver
```

- **`node`, never `bun`** — bun on Windows cannot hold Playwright's stdio pipe,
  so every launch times out.
- Dev server must be up (`bun run dev`), and the script imports `playwright`
  from the repo, so run it from the repo root.
- Writes `shots/{top,scrolled,open,jumped}.png` at iPhone 14 Pro size. Read the
  PNGs — that is the feedback loop.
- For a one-off check, copy the script, edit it, run it, delete it. Assert with
  `page.evaluate` (counts, rects, `aria-current`) rather than eyeballing.