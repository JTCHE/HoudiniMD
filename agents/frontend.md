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
node scripts/webkit-shot.ts houdini/nodes/dop/pyrosolver
```

- **`node`, never `bun`.** Bun on Windows cannot hold Playwright's stdio pipe,
  so the launch times out.
- The dev server must run (`bun run dev`).
- The script writes `shots/{top,scrolled,open,jumped}.png` at iPhone 14 Pro
  size. Read the PNGs. That is the feedback loop.

For a one-off check, copy the script, edit it, run it, delete it. Assert with
`page.evaluate` — counts, rects, `aria-current` — instead of your eyes.
