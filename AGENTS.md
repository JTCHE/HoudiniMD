# AGENTS.md

Project information: @README.md

## Guides

- [Architecture](agents/architecture.md) — the four layers, and which file owns what.
- [Deployment](agents/deployment.md) — Cloudflare CI deploys. You do not.
- [Code](agents/code.md) — one source of truth, small modules, no legacy paths.
- [Front-end](agents/frontend.md) — the design language, and how to look at a change.
- [Testing](agents/testing.md) — test the change, do not commit the test.
- [Issues](agents/issues.md) — where specs live.

## Rules

- Use ASD-STE100 Simplified Technical English in all writing: replies, comments,
  commits, pull requests.
- Do not keep backward compatibility. Delete the old path. Do not add fallbacks,
  shims, or migrations.
- Do not write documentation that a person can get from the code. Write a short
  comment in the code instead.
- Do not record a fact that goes stale: page counts, version numbers, file
  inventories, benchmark tables, audit results. Point to the code that holds it.
- Do not add a file to this repo unless the product needs it. Scratch work goes
  in a temporary directory.
- Look at a UI change before you report it done. A build that compiles is not a
  page that reads.
