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

`harness/compare.mts` does that check by machine. It samples pages from the
index and puts three renderings of each beside one another — the SideFX page,
the `houdinimd.com` mirror, and this app — and reports only where the two
references agree on the shape of a region and the app does not. Both
references come from the doc build's HTML; the app parses the wiki markup
underneath it, so the app is the one that can be wrong on its own.

```bash
node harness/compare.mts --pages 40 --seed 3
```

It reads in two lanes. One reads what a page is made of, out of the markdown
and the SideFX DOM: sections, tables, figures, and how much of each. The other
draws all three pages in a browser and measures every kind of thing a doc page
is built from — heading, row, label, cell, picture, fence, term, quote, link,
note — the same eight ways: how many, how wide, how tall, what type size, what
weight, slanted, typewriter, empty. A broken table or a lost stylesheet only
shows in the second lane.

**Nothing in it knows about a bug.** It holds no list of bad markers and no
list of things that went wrong before, because a list like that only finds
what somebody already found, and goes stale the day it is fixed. It holds a
list of kinds of thing and a list of how to judge a measurement by the word
its name ends in. Markup that reached the reader is worked out the same way:
any run of punctuation the app shows that neither reference shows. To widen
the net, add a kind or a measurement, never a rule.

It also reads the mirror's sitemap, because sampling from the app's own index
can never find a page the app does not know it should have.

Every finding carries a direction. `behind` is the app with less than both
references, and is the list to work from. `ahead` is the app with more, which
happens on purpose. `different` is neither. A finding that has been looked at
and kept goes in `harness/accepted.json` by its signature, with the reason,
and stops being reported.

It groups findings by defect, not by page, so one run names the parser rules
to fix. Nothing is computed twice: fetched pages, parsed shapes and drawn
measurements are all cached by the hash of what they came from, so a second
run over the same pages does no network and no parsing. Its cache and its
report hold SideFX text and stay in `harness/out/`, which is not version
controlled.

## Never commit the content

Not a page, not a picture, not a test file made from one, not a long quoted
example. It is SideFX property and the reason this product became an app.
Build fixtures on the machine that runs the test, in a temporary directory.
