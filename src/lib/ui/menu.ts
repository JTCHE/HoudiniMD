/**
 * The drop-down menu of the page header: its look and its keys, in one place,
 * so the page actions and the node version list cannot drift apart.
 */
import { useEffect, useRef, useState } from "react";

export const MENU_PANEL =
  "absolute top-[calc(100%+4px)] right-0 z-50 origin-top-right rounded-lg border border-hairline bg-raised p-1 " +
  "shadow-xl shadow-black/10 animate-[dropdown-in_120ms_cubic-bezier(0.2,0,0,1)] motion-reduce:animate-none";

export const MENU_ITEM =
  "flex w-full cursor-interactive items-center gap-2.5 rounded-md px-sm py-[7px] text-left text-[13px] " +
  "text-neutral-800 transition-colors duration-(--duration-fast) motion-reduce:transition-none " +
  "pointer-hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none";

export const MENU_ICON = "size-3.5 shrink-0 text-neutral-500";

const ITEMS = "[role=menuitem], [role=option]";

/**
 * The menu opens with the focus on the chosen item, or on the first, and
 * closes on a click outside it or on Escape, which gives the focus back to the
 * button that opened it. The focus waits one frame: the click that opened the
 * menu focuses the button after this effect has run.
 *
 * `onKeyDown` goes on the whole control, not the menu, so the keys also work
 * while the focus is still on the button.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const list = menu.current;
      (list?.querySelector<HTMLElement>("[aria-selected=true]") ?? list?.querySelector<HTMLElement>(ITEMS))?.focus();
    });
    const outside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", outside);
    };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) return;
    const items = [...(menu.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return { open, setOpen, container, menu, trigger, onKeyDown };
}
