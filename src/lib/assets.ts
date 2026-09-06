import { convertFileSrc } from "@tauri-apps/api/core";

import { inTauri } from "./backend";

/** Where the app reads pictures from: the zips in the Houdini install itself.
    Rust serves them; see `help.rs`.

    Two doors, the same as the commands in `backend.ts`. In the desktop window a
    custom scheme reads them, and its address is not the same on every platform
    — Windows gets `http://hicon.localhost/…` and macOS `hicon://localhost/…` —
    so Tauri builds it rather than this file. Inside Houdini's help pane there
    is no such scheme: QtWebEngine has no handler for one, and shows a broken
    image without ever asking the network. There, `server.rs` serves the same
    bytes on an ordinary path. */

/** `SOP/box.svg` in `icons.zip`. */
export function iconUrl(name: string): string {
  const clean = name.replace(/^\/+/, "");
  return inTauri ? convertFileSrc(clean, "hicon") : `/hicon/${clean}`;
}

/** An asset path from the Rust side: `images/shelf/copy.jpg` in `images.zip`,
    or `videos/tween.webm` beside it. `assets.rs` resolved it against the page,
    so nothing here has to know how the help serves its pictures. */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  return inTauri ? convertFileSrc(clean, "himage") : `/himage/${clean}`;
}
