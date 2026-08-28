/** Where the app reads pictures from: the zips in the Houdini install itself.
    Rust serves them; see `help.rs`. */

/** `SOP/box.svg` in `icons.zip`. */
export function iconUrl(name: string): string {
  return `http://hicon.localhost/${name.replace(/^\/+/, "")}`;
}

/** `/images/shelf/copy.jpg` in `images.zip`. */
export function imageUrl(path: string): string {
  return `http://himage.localhost/${path.replace(/^\/?(images\/)?/, "")}`;
}
