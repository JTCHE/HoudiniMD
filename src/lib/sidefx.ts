import { HOUDINI_DOCS_ROOT } from "./houdini";

/** The same page on sidefx.com. The app reads the local copy; the header
    still offers the original. */
export function sideFxUrl(path: string): string {
  return `${HOUDINI_DOCS_ROOT}/${path.replace(/\/index$/, "")}`;
}
