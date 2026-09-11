# HoudiniMD

![The SideFX Box node docs page (left) beside HoudiniMD's clean rendering (right)](public/cover.png)

## A blazing-fast, clutter free, clean Markdown mirror of the Houdini docs.<br>Built for humans to read, and agents to understand.<br><br>

<br>
<div align="center">
  <a target="_blank" href="https://houdinimd.com"><img src="public/badges/website.svg" height="42" alt="Open HoudiniMD"></a>
  <a target="_blank" href="https://github.com/JTCHE/houdini-mcp"><img src="public/badges/mcp.svg" height="42" alt="Houdini MCP"></a>
  <a target="_blank" href="https://github.com/sponsors/JTCHE?frequency=one-time"><img src="public/badges/sponsor.svg" height="42" alt="Sponsor on GitHub"></a>
</div>
<br>

HoudiniMD mirrors SideFX's official Houdini documentation into clean markdown, served through a minimal, near-instant interface. Same content, displayed inside a clean and responsive interface.

![A horizontal bar chart comparing full page load time between the official SideFX docs and HoudiniMD, with the latter showing a median of 10.7x faster loading times than the former](public/load-time-benchmark.png)

It follows the [llms.txt](https://llmstxt.org) standard. AI agents are automatically redirected to raw markdown instead of scraping cluttered HTML. They get accurate, low-noise context about Houdini's nodes and functions; exactly the kind of niche knowledge even frontier models still lack.

## Features

- **Fast** — pages load instantly. <kbd>⌘K</kbd> to search, <kbd>⌘C</kbd> to copy as Markdown
- **Full Mirror, Clean Markdown** — every current and future doc page under `sidefx.com/docs` mirrored to readable markdown, dark mode included.
- **Instant search** — find any node, VEX function, or niche HOM API. You can even paste full SideFX links directly.
- **llms.txt native** — agents get raw markdown, not scraped HTML, cutting context bloat.
- **Houdini Integration** — After setting it as the default source, press <kbd>F1</kbd> to bring up HoudiniMD directly inside Houdini
- **AI Native & MCP Integration** — Paired with my [Houdini MCP](https://github.com/JTCHE/houdini-mcp) fork, agents can query pure markdown directly from HoudiniMD to inform their decisions and actions inside Houdini. Accurate info, at the right time, without context bloat.

## Desktop app

[Download for Windows](https://github.com/JTCHE/HoudiniMD/releases/latest). Reads the docs from the Houdini build on your machine, so it works with no network. <kbd>F1</kbd> in Houdini opens the page in it.

Windows shows "Windows protected your PC" because the installer is not signed yet. Select **More info**, then **Run anyway**. A signature needs a legal entity, and it is on the list.

## Price

Free. No account, no subscription. A doc page is public and belongs to SideFX, so no doc page is ever going behind a payment. Paid features later will be things the app makes: your own notes on a page, an index of your studio's assets, differences between two Houdini builds.

## Credits & license

Built by [John C](https://jchd.me). HoudiniMD is an unofficial, independent project and is not affiliated with or endorsed by SideFX.

**The code in this repository** is released under the [MIT License](LICENSE).

**The documentation content is not.** Every Houdini doc page is mirrored from SideFX, remains their intellectual property, and stays © SideFX. No documentation content is stored in this repository, and the MIT License above gives you no rights over it. HoudiniMD stands on the work of the SideFX documentation team; the content is theirs, only the presentation is mine.
