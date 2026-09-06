# Front-end

## Design language

Every main visual element sits on the same vertical axis down the page. A
component therefore carries a negative margin equal to its padding, so its
content aligns with the content of the component above it.

Colors, spacing, and type come from the tokens in `src/styles/globals.css`. Do
not write a raw value that a token already holds.

The app is a window, not a website. It has no navigation bar of its own, no
cookie notice, and no page that scrolls sideways. Chrome that a browser would
give you, this app has to draw.

## Where the app is deliberately not the website

`houdinimd.com` and the app share a design, not every decision. The two below
are settled. Do not "fix" them back, and do not report them as defects when
`harness/compare.mts` puts the app beside the website.

- **Lists are lists.** The website draws a list of pages as a grid of cards.
  The app draws a plain list.
- **Links are orange.** The link colour in the app is the accent, not the
  website's white.

## Look at the change

Open the page and look at it. A build that compiles is not a page that reads.

`bun run app` starts the Vite dev server and the Rust side together. The window
it opens is a real webview on a real Houdini install, so it is the true check.

This machine has no interactive desktop session for a headless agent, so a
Tauri window cannot be driven from here. Verify against the built front-end
instead:

1. `bun run build`, then serve `dist/`.
2. Open it with a Browser MCP.
3. Stub `window.__TAURI_INTERNALS__` before the bundle runs, so `invoke`
   answers with a real page payload and `convertFileSrc` returns a URL.

Assert with `page.evaluate` — counts, rects, `naturalWidth`, `readyState` —
instead of your eyes. A picture that loaded is not a picture drawn at the
right size.
