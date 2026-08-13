# Page Content

## Regenerate is safe. Use it.

When you change how a page is scraped, converted, or shaped — `lib/scraping/`,
`lib/markdown/`, `lib/generator.ts` — the markdown already in R2 keeps the old
shape. Your fix is not done until the affected pages hold the new shape.

```bash
bun run regen --url "houdini/nodes/sop/*"
```

**This does not change the live site.** `regen` writes the docs bucket. Every
prerendered page serves from the ISR cache, a different bucket that the deploy
fills (`scripts/cache-sync.ts`). The reader gets the same page before and after
you run it. The new markdown reaches the site on the next CI deploy.

So the cost is a few requests to SideFX, not a production change. Do not ask
for permission to run it, and do not stop at one sample page.

## Pick every affected page

Name the pages your change touches, then regenerate all of them:

1. Find the pattern the rule matches — a node category, a doc section, a page
   family with the same broken table or heading.
2. Expand it with `--url` globs, one `--url` per pattern. `--dry-run` lists the
   matches without a fetch.
3. Read the output, open one of the pages, and confirm the shape.

`scripts/regenerate.ts` holds every source of slugs (`--all`, `--stale`,
`--missing`, `--cache-misses`) and every option. Read its header comment before
you invent a list by hand.
