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

Drive the front-end headlessly. Do not reach for the computer-use MCP: it
takes the reader's screen and needs their permission for every application.
Keep it for the last resort — a native window part with no other door, such as
the webview's own right-click menu — and say so before you ask.

The headless route, and the reason it works: the app serves its own front end
and its own data over HTTP (`server.rs`), and that server answers
`/api/<command>` exactly as `invoke` does.

1. Start the app (`bun run app`). Read the port from the status bar, or from
   `listening on localhost:<port>` in the log.
2. Open the Vite dev server in a Browser MCP or in Playwright, and send every
   `/api/`, `/himage/` and `/hicon/` request on to that port. Same origin, no
   CORS, no stub, and the real Houdini install behind it.
3. `await import("/src/lib/<module>.ts")` in the page to call a module
   directly — the dev server serves the real source as an ES module.

Two traps. The Browser pane can hold a stale paint after a scroll or a
navigation, so a black screenshot is not an empty page; assert first, then
screenshot. A background server dies with the shell that started it; start it
with `Start-Process -WindowStyle Hidden`.

Assert with `page.evaluate` — counts, rects, `naturalWidth`, `readyState` —
instead of your eyes. A picture that loaded is not a picture drawn at the
right size.
