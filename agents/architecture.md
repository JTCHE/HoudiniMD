# Architecture

A Tauri 2 desktop app. Rust is the backend, React on Vite is the front-end.
No documentation content lives in this repo — every page is read out of the
Houdini install on the reader's own machine.

Four layers.

1. **Source** — `src-tauri/src/install.rs` finds the Houdini builds on this
   machine, and `help.rs` reads one page or one asset out of them. Pages sit
   in one zip per doc section under `$HFS/houdini/help`. Nothing above this
   layer touches the filesystem.
2. **Parser** — `src-tauri/crates/wiki`. SideFX wiki markup in, a typed `Page`
   out (`model.rs`), then Markdown out (`markdown.rs`). It knows nothing about
   Houdini installs, zips, or the app; it takes a string and returns a value.
3. **App** — `src-tauri/src/lib.rs` holds the commands the front-end calls with
   `invoke`, plus the `hicon` and `himage` URI schemes that serve icons and
   assets. `db.rs`, `index.rs` and `sections.rs` own the SQLite FTS5 index.
   `assets.rs` resolves a page-relative asset reference against the page.
4. **Front-end** — `src/`. `routes/` are the screens, `components/` draw them,
   `lib/` holds the logic they share. It renders Markdown; it never parses
   wiki markup.

## The read flow

One page takes one path: `page(path)` finds the current install, reads the
`.txt` out of its zip, parses it, rewrites its asset references, and returns
Markdown with the page's metadata beside it.

This never waits on the index. The first page a reader opens is parsed on
demand even when the background index pass has not reached it. That is a
non-negotiable — an artist pressing F1 must not wait for a full index.

## Boundaries

- The `wiki` crate is pure. It reads no file and knows no path. Anything that
  needs the install belongs in `src-tauri/src/`.
- `install.rs` decides where Houdini is. Nothing else builds that path.
- `assets.rs` decides what an asset reference means. It writes one path shape,
  and `help.rs` reads that shape. The front-end only builds a URL from it.
- `src/routes/` composes. It does not call the filesystem, rank a result, or
  reshape Markdown.
- One database. A Houdini build is a column in it, not a folder.
