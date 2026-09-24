import { iconUrl } from "./assets";

/** A help page names an icon by its path in `icons.zip`, e.g. `SOP/box.svg`. */
export function localIconUrl(source: string): string {
  return source.startsWith("http") ? source : iconUrl(source);
}

/** Icons this window holds, and icons the install does not ship.
    The picture itself is kept, not only its name: WebView2 does not keep a
    `hicon:` response in its cache, and a row mounted again fetched its icon
    again and drew a blank for a few frames. A live image keeps it in memory. */
export const loaded = new Map<string, HTMLImageElement>();
export const missing = new Set<string>();

/** Icons fetched ahead and not yet in. */
const fetching = new Map<string, Promise<void>>();

/** Fetch icons before a row asks for them, so the row draws with its icon.
    Settles when every one is in or known missing. */
export function warmIcons(sources: string[]): Promise<void> {
  return Promise.all(
    sources.map((source) => {
      if (loaded.has(source) || missing.has(source)) return;
      let done = fetching.get(source);
      if (!done) {
        const image = new Image();
        done = new Promise<void>((settle) => {
          image.onload = () => settle(void loaded.set(source, image));
          image.onerror = () => settle(void missing.add(source));
        }).finally(() => fetching.delete(source));
        fetching.set(source, done);
        image.src = localIconUrl(source);
      }
      return done;
    }),
  ).then(() => {});
}
