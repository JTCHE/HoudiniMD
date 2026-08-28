import { iconUrl } from "./assets";

/** A help page names an icon by its path in `icons.zip`, e.g. `SOP/box.svg`. */
export function localIconUrl(source: string): string {
  return source.startsWith("http") ? source : iconUrl(source);
}
