import { useSyncExternalStore } from "react";

/** One picture the lightbox can show. */
export interface LightboxItem {
  src: string;
  alt: string;
}

export interface LightboxState {
  items: LightboxItem[];
  index: number;
  /** The picture on the page it opened from: the open grows out of it and
      the close shrinks back into it. */
  from: HTMLElement | null;
}

/** The pictures of the open page, in page order. The lightbox walks these
    with the arrow keys, the way a reader expects to walk a page's figures. */
export const PAGE_PICTURES = "article img.markdown-media";

let state: LightboxState | null = null;
const listeners = new Set<() => void>();

function set(next: LightboxState | null) {
  state = next;
  for (const listener of listeners) listener();
}

/** Opens on `picture`, with every picture of the page behind it. */
export function openLightbox(picture: HTMLImageElement) {
  const pictures = [...document.querySelectorAll<HTMLImageElement>(PAGE_PICTURES)];
  const index = Math.max(0, pictures.indexOf(picture));
  set({
    items: pictures.map((img) => ({ src: img.currentSrc || img.src, alt: img.alt })),
    index,
    from: picture,
  });
}

export function closeLightbox() {
  set(null);
}

export function useLightbox(): LightboxState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
