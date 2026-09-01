import { convertFileSrc } from "@tauri-apps/api/core";

/** Where the app reads pictures from: the zips in the Houdini install itself.
    Rust serves them; see `help.rs`.

    The address of a custom scheme is not the same on every platform — Windows
    gets `http://hicon.localhost/…` and macOS gets `hicon://localhost/…` — so
    Tauri builds it rather than this file. */

/** `SOP/box.svg` in `icons.zip`. */
export function iconUrl(name: string): string {
  return convertFileSrc(name.replace(/^\/+/, ""), "hicon");
}

/** `/images/shelf/copy.jpg` in `images.zip`. */
export function imageUrl(path: string): string {
  return convertFileSrc(path.replace(/^\/?(images\/)?/, ""), "himage");
}
