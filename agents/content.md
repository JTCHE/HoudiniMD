# Content

The app stores no documentation. It reads what the installed Houdini ships, so
there is no cache to regenerate and no bucket to fill. Change the parser and
the next page a reader opens already has the new shape.

## The source

`$HFS/houdini/help` holds one zip per doc section, plus `images.zip` and a
loose `videos/` folder. `install.rs` finds it. Verified on 22.0.368: 10,450
`.txt` pages across 47 zips.

The pages are SideFX wiki markup, not HTML. `format.txt` in that folder is the
specification, and it is the only thing to write the parser against. Read it
before you guess at a marker.

The markup carries meaning the old HTML scraper never saw: typed metadata
(`#type:`, `#context:`, `#icon:`), structured `@parameters` blocks, `:usage:`
signatures, and typed links such as `[Node:sop/lattice]`. Keep that meaning in
`model.rs`. Flattening it to a string early is how the scraper lost it.

## When you change the parser

Nothing is stored, so nothing needs a rebuild. But the change reaches 10,450
pages at once, and one marker appears on thousands of them. Check the shape on
a family of pages, not on the one page that showed the bug:

- A node page with parameters and figures (`nodes/sop/rbdmaterialfracture`).
- A VEX page with signatures (`vex/functions/noise`).
- A prose page with tables and includes (`basics/intro`).

Read the Markdown the parser returns, then look at the drawn page. They fail
in different ways.

## Never commit the content

Not a page, not a picture, not a test file made from one, not a long quoted
example. It is SideFX property and the reason this product became an app.
Build fixtures on the machine that runs the test, in a temporary directory.
