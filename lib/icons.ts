import { HOUDINI_ICON_ROOT } from "./houdini";

const SIDEFX_ICON_ROOT = `${HOUDINI_ICON_ROOT}/`;
const SIDEFX_SVG_URL = new RegExp(`${SIDEFX_ICON_ROOT.replaceAll(".", "\\.")}[^\\s)\\"']+\\.svg`, "g");

export function localIconUrl(source: string): string {
  if (!source.startsWith(SIDEFX_ICON_ROOT) || !source.endsWith(".svg")) return source;
  return `/icons/${source.slice(SIDEFX_ICON_ROOT.length)}`;
}

export function localizeIconUrls(content: string): string {
  return content.replace(SIDEFX_SVG_URL, localIconUrl);
}
