# Front-end

## Design language

Every main visual element sits on the same vertical axis down the page. A
component therefore carries a negative margin equal to its padding, so its
content aligns with the content of the component above it.

Colors, spacing, and type come from the tokens in `app/globals.css`. Do not
write a raw value that a token already holds.

## Look at the change

Open the page. A Browser MCP, not a headless CLI — `curl` cannot show you a
layout.

For iOS, confirm the change through the WebKit pipeline:

```bash
MSYS_NO_PATHCONV=1 node scripts/webkit-shot.ts /docs/houdini/nodes/chop
```

- **`node`, never `bun`.** Bun on Windows cannot hold Playwright's stdio pipe,
  so the launch times out.
- The dev server must run on port 3112, or set `SHOT_BASE`.
- `MSYS_NO_PATHCONV=1` stops Git Bash from turning the path into a file path.
- The script writes `shots/{first,settled}.png` at iPhone 14 Pro size: before
  and after hydration. Read the PNGs.

For a one-off check, copy the script, edit it, run it, delete it. Assert with
`page.evaluate` — counts, rects, `aria-current` — instead of your eyes.
