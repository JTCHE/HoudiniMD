# HoudiniMD

![The SideFX Box node docs page (left) beside HoudiniMD's clean rendering (right)](public/cover.png)

## A blazing-fast, clutter free, clean Markdown mirror of the Houdini docs.<br>Built for humans to read, and agents to understand.<br><br>

<br>
<div align="center">
  <a target="_blank" href="https://houdinimd.com"><img src="public/badges/website.svg" height="42" alt="Open HoudiniMD"></a>
  <a target="_blank" href="https://houdinimd.com/download"><img src="public/badges/download.svg" height="42" alt="Download for Windows"></a>
  <a target="_blank" href="https://github.com/JTCHE/houdini-mcp"><img src="public/badges/mcp.svg" height="42" alt="Houdini MCP"></a>
  <a target="_blank" href="https://github.com/sponsors/JTCHE?frequency=one-time"><img src="public/badges/sponsor.svg" height="42" alt="Sponsor on GitHub"></a>
</div>
<br>

HoudiniMD mirrors SideFX's official Houdini documentation into clean markdown, served through a minimal, near-instant interface. Same content, displayed inside a clean and responsive interface.

<img src="public/load-time-benchmark.png" alt="A horizontal bar chart comparing full page load time between the official SideFX docs and HoudiniMD, with the latter showing a median of 10.7x faster loading times than the former">

It follows the [llms.txt](https://llmstxt.org) standard. AI agents are automatically redirected to raw markdown instead of scraping cluttered HTML. They get accurate, low-noise context about Houdini's nodes and functions; exactly the kind of niche knowledge even frontier models still lack.

## Features

- **Fast** — pages load instantly. <kbd>⌘K</kbd> to search, <kbd>⌘C</kbd> to copy as Markdown
- **Full Mirror, Clean Markdown** — every current and future doc page under `sidefx.com/docs` mirrored to readable markdown, dark mode included.
- **Instant search** — find any node, VEX function, or niche HOM API. You can even paste full SideFX links directly.
- **llms.txt native** — agents get raw markdown, not scraped HTML, cutting context bloat.
- **Houdini Integration** — After setting it as the default source, press <kbd>F1</kbd> to bring up HoudiniMD directly inside Houdini
- **AI Native & MCP Integration** — Paired with my [Houdini MCP](https://github.com/JTCHE/houdini-mcp) fork, agents can query pure markdown directly from HoudiniMD to inform their decisions and actions inside Houdini. Accurate info, at the right time, without context bloat.

## Install
<img src="public/help-server-benchmark.png" alt="A horizontal bar chart comparing the time from F1 to a readable page in Houdini's help pane, between Houdini's own help server and HoudiniMD, with the latter showing a median of 13.1x faster">
HoudiniMD is also now available as a Desktop app, living locally, directly on your computer.

[Download for Windows](https://houdinimd.com/download).

The desktop app reads the docs from the Houdini build on your machine, so it works with no network. <kbd>F1</kbd> in Houdini opens the page in it.

> [!WARNING]
> Windows shows "Windows protected your PC" because the installer is not signed yet. Select **More info**, then **Run anyway**. A signature needs a legal entity, and it is on the list.

<details>
<summary><b>Linux</b> — one AppImage, no install</summary>

<br>

Download `HoudiniMD.AppImage` from the [latest release](https://github.com/JTCHE/HoudiniMD/releases/latest), then:

```sh
chmod +x HoudiniMD.AppImage
./HoudiniMD.AppImage
```

The file carries its own WebKitGTK, so it needs no packages. It is built on Ubuntu 22.04 and runs on glibc 2.34 and later: RHEL 9, Rocky 9, AlmaLinux 9, Ubuntu 22.04 and 24.04. On Ubuntu 26.04 the web process dies in EGL — that is WebKit 2.50 against a very new mesa, and it is not fixed yet.

**Build it yourself.** You need [Bun](https://bun.sh), [Rust](https://rustup.rs) and, on a Debian or Ubuntu base:

```sh
sudo apt install build-essential curl wget file pkg-config libssl-dev python3 \
  libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev \
  patchelf xdg-utils desktop-file-utils
```

```sh
bun install
bun run tauri build --bundles appimage
```

The file lands in `src-tauri/target/release/bundle/appimage/`. That file runs on the distro that built it. To also reach RHEL 9, run the widen pass over the packed folder — it carries the fonts stack, retags `hypot`, and puts a newer `libstdc++` where only an older host uses it:

```sh
cd src-tauri/target/release/bundle/appimage
OUTPUT=$PWD/HoudiniMD.AppImage bash ../../../../linux/widen.sh HoudiniMD.AppDir
```

The release workflow does all of this: [.github/workflows/release.yml](.github/workflows/release.yml).

</details>

## Pricing

Free. No account, no subscription. A doc page is public and belongs to SideFX, so no doc page is ever going behind a payment. 

Paid features will come in a later update to support power-users and allow them to write custom notes on a page, sync their settings and bookmarks across machines in the cloud, and much more.

## Credits & license

Built by [John C](https://jchd.me). HoudiniMD is an unofficial, independent project and is not affiliated with or endorsed by SideFX.

**The code in this repository** is released under the [MIT License](LICENSE).

HoudiniMD is an unofficial, independent project, and isn't affiliated with or endorsed by SideFX.