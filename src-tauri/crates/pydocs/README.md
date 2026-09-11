# houdinimd-docs

A parser and search engine for the Houdini documentation.

Houdini ships its help as thousands of text pages (about 12,000 in Houdini
22.0 with SideFX Labs), written in SideFX's own wiki markup. Nothing outside
Houdini reads that format. This module parses the markup, converts every page
to clean Markdown, and indexes all of them for ranked full-text search.

It is the documentation engine of the [HoudiniMD](https://houdinimd.com)
desktop app, written in Rust and compiled into a Python module. The
[HoudiniMCP](https://github.com/JTCHE/houdini-mcp) bridge uses it.

No documentation ships in this package. Every page comes from the help files
of an installed Houdini, so the text matches that build exactly.

```python
import houdinimd_docs

docs = houdinimd_docs.Docs("/path/to/a/folder/for/the/index")
docs.installs()                          # the Houdini builds found, newest first
docs.page("nodes/sop/copytopoints")      # one page, as Markdown
docs.search("copy to points", limit=5)   # ranked full-text search
docs.page("hom/hou/Node", build="21.0.829")
```

Every call returns a JSON string. `page` raises `ValueError` when the build
has no such page.

The first search on a build indexes it into a SQLite file in the folder you
name, which takes a few seconds. The index stays there, so this happens once
per build. A page read never waits for it.

Without `build`, the reader uses the Houdini in `$HFS`, then the newest build
it finds. The build comes from the install's own `SYS_Version.h`, never from
its folder name.
