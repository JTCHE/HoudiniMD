import { HOUDINI_DOCS_ROOT } from "./houdini";

/** The same page on sidefx.com. The app reads the local copy; the header
    still offers the original. SideFX answers a context overview only as
    `nodes/sop/index.html`: the folder URL is not a page there. */
export function sideFxUrl(path: string): string {
  return path.endsWith("/index") ? `${HOUDINI_DOCS_ROOT}/${path}.html` : `${HOUDINI_DOCS_ROOT}/${path}`;
}
