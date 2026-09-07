# AGENTS.md

Project information: @README.md

## Guides

- [Architecture](agents/architecture.md) — the four layers, and which file owns what.
- [Deployment](agents/deployment.md) — the app does not deploy. The site still does.
- [Content](agents/content.md) — the docs come from the Houdini install, not from here.
- [Code](agents/code.md) — one source of truth, small modules, no legacy paths.
- [Front-end](agents/frontend.md) — the design language, and how to look at a change.
- [Testing](agents/testing.md) — test the change, do not commit the test.
- [Issues](agents/issues.md) — where specs live.

## Animation and compositing

An animation that never stops keeps the compositor busy. The cost is highest on
a 120 Hz display and on a high-resolution display. Obey these rules.

- Do not put an animation that repeats for ever on a control that stays on the
  screen. A status dot, a sidebar mark and a typing dot are examples. Each one
  looks small. Together they prevent the window from becoming idle.
- Be careful with `animate-pulse`. Tailwind makes this animation easy to add.
  The cost is not easy to see in the code.
- Animate `transform` and `opacity` only. The compositor can do these two
  without the main thread.
- Do not put an animation together with `backdrop-blur`, a filter, a
  transparent layer or a grain layer. Each one is a cost. Together the cost is
  more than the sum.
- Stop an animation that the reader cannot see. Pause it when the window loses
  the focus.
- Obey `prefers-reduced-motion`. Give the same information without the motion.
- Do not remove an animation because you think it is expensive. A loading
  skeleton, a spinner and a progress mark measured almost zero. Measure first.
- Do not trust the performance panel of the browser tools alone. It shows
  little work in the script and in the layout while the GPU process uses much
  CPU. Look at the GPU process.

Use an animation only when it tells the reader something. If it tells the
reader nothing, draw it static.

## Rules

- Read the documentation before you write code against a service, quote a rate,
  or state a limit. Do not answer from memory. Prefer the site's own `llms.txt`
  or `index.md`; otherwise prefix the link with `markdown.new/` for clean raw
  text. Cloudflare publishes every page as `<url>/index.md`.
- Use ASD-STE100 Simplified Technical English in all writing: replies, comments,
  commits, pull requests.
- Do not keep backward compatibility. Delete the old path. Do not add fallbacks,
  shims, or migrations.
- Do not write documentation that a person can get from the code. Write a short
  comment in the code instead.
- Do not record a fact that goes stale: page counts, version numbers, file
  inventories, benchmark tables, audit results. Point to the code that holds it.
- Do not publish, commit, or push SideFX content or any other copyrighted
  material. This includes doc pages, test fixtures made from doc pages, images
  from the Houdini install, and examples quoted at length. Make test fixtures on
  the machine that runs the test and keep them out of version control.
- Do not add a file to this repo unless the product needs it. Scratch work goes
  in a temporary directory.
- Do not commit SQL migration files. Write them in `migrations/`, apply, then delete
  the file.
- Look at a UI change before you report it done. A build that compiles is not a
  page that reads.
- This machine has an interactive desktop. To look at the app, serve the built `dist` with a
  stub for those internals — see [Testing](agents/testing.md).
- When you change the parser or the renderer, check the shape on a family of
  pages, not on the one page that showed the bug — see
  [Content](agents/content.md).
