/**
 * The right-click menu, drawn by the app.
 *
 * The webview's own menu is a browser's — reload, inspect, save the app's
 * HTML shell — and reads as a web page inside the window. This one holds what
 * the reader can do where they pressed: a link, a picture, a selection, the
 * page. A field the reader types in keeps the webview's menu, because cut,
 * copy and paste live there. In a development build Shift keeps it too, for
 * Inspect.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Copy, Download, ExternalLink, Image, Link2, ListTree, SquareArrowOutUpRight } from "lucide-react";
import { accelerators, MENU_ICON, MENU_ITEM } from "@/lib/ui/menu";
import { revealInSidebar } from "@/components/shell/sidebar/PageTree";
import { cn } from "@/lib/utils";
import { useTrail } from "@/lib/nav";
import { pageActions } from "@/lib/page-actions";
import { HOUDINIMD_DOCS_ROOT } from "@/lib/houdini";
import { sideFxUrl } from "@/lib/sidefx";
import { openWeb } from "@/lib/web";
import { openLightbox, PAGE_PICTURES } from "@/lib/lightbox";
import { showToast } from "@/components/ui/toast-notification";
import { used } from "@/lib/telemetry";

interface Item {
  label: string;
  icon: typeof Copy;
  keys?: string;
  disabled?: boolean;
  run: () => unknown;
}

/** Groups, drawn with a line between them. */
type Menu = Item[][];

/** The web address of a link the app draws: the site's copy of the page. */
function shareable(href: string): string {
  const url = new URL(href, location.href);
  return url.origin === location.origin ? `${HOUDINIMD_DOCS_ROOT}${url.pathname}${url.hash}` : url.href;
}

async function copyText(text: string, said: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(said);
  } catch {
    showToast("Couldn't copy", "error");
  }
}

export function ContextMenu() {
  const [at, setAt] = useState<{ x: number; y: number; menu: Menu } | null>(null);
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useTrail();
  // The listener is attached once and reads the trail of the moment.
  const trail = useRef({ canGoBack, canGoForward });
  trail.current = { canGoBack, canGoForward };

  useEffect(() => {
    const onMenu = (event: MouseEvent) => {
      // A control with a menu of its own (the app's name) took it already.
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (import.meta.env.DEV && event.shiftKey) return;
      event.preventDefault();
      const menu: Menu = [];

      const link = target?.closest<HTMLAnchorElement>("a[href]");
      if (link) {
        menu.push([
          { label: "Open link", icon: ExternalLink, run: () => link.click() },
          { label: "Copy link address", icon: Link2, run: () => copyText(shareable(link.href), "Link copied") },
        ]);
      }
      const picture = target?.closest<HTMLImageElement>(PAGE_PICTURES);
      if (picture) menu.push([{ label: "Open picture", icon: Image, run: () => openLightbox(picture) }]);

      const page = pageActions();
      if (page && target?.closest("[data-current-crumb]")) {
        menu.push([{ label: "Reveal in sidebar", icon: ListTree, run: revealInSidebar }]);
      }

      // One Copy, as Ctrl C does: the selection when there is one, else the
      // whole page as Markdown.
      const selected = window.getSelection()?.toString().trim() ? window.getSelection()!.toString() : "";
      const copy: Item = {
        label: "Copy",
        icon: Copy,
        keys: "Ctrl+C",
        run: () =>
          selected || !page
            ? copyText(selected, "Copied")
            : page.copy().then((done) => done && showToast("Markdown copied to clipboard")),
      };
      if (!page && selected) menu.push([copy]);

      if (page) {
        const group: Item[] = [
          copy,
          {
            label: "Copy page link",
            icon: Link2,
            run: () => copyText(`${HOUDINIMD_DOCS_ROOT}/${page.path}`, "Link copied"),
          },
          { label: "Open on sidefx.com", icon: SquareArrowOutUpRight, run: () => openWeb(sideFxUrl(page.path)) },
        ];
        const { save } = page;
        if (save) group.push({ label: "Save as…", icon: Download, keys: "Ctrl+S", run: save });
        menu.push(group);
      }

      menu.push([
        { label: "Back", icon: ArrowLeft, keys: "Alt+←", disabled: !trail.current.canGoBack, run: () => navigate(-1) },
        { label: "Forward", icon: ArrowRight, keys: "Alt+→", disabled: !trail.current.canGoForward, run: () => navigate(1) },
      ]);
      setAt({ x: event.clientX, y: event.clientY, menu });
    };
    document.addEventListener("contextmenu", onMenu);
    return () => document.removeEventListener("contextmenu", onMenu);
  }, [navigate]);

  if (!at) return null;
  return <Panel at={at} onClose={() => setAt(null)} />;
}

function Panel({ at, onClose }: { at: { x: number; y: number; menu: Menu }; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: at.x, top: at.y });

  // Open down and right of the pointer, or up and left where the window ends.
  useLayoutEffect(() => {
    const box = panel.current;
    if (!box) return;
    const { width, height } = box.getBoundingClientRect();
    const left = at.x + width > innerWidth - 4 ? Math.max(4, at.x - width) : at.x;
    const top = at.y + height > innerHeight - 4 ? Math.max(4, at.y - height) : at.y;
    setPlace({ left, top });
    // The menu takes the keys; an item lights only once the arrows reach it.
    box.focus({ preventScroll: true });
  }, [at]);

  useEffect(() => {
    const outside = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", outside);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const items = at.menu.flat();
  const letters = accelerators(items.map((item) => item.label));

  function run(item: Item) {
    onClose();
    used("right-click");
    void Promise.resolve(item.run()).catch((reason) => showToast(String(reason), "error"));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // A letter runs the item it is underlined in.
    const key = event.key.toLowerCase();
    const hit = items.findIndex((item, i) => letters[i] >= 0 && item.label[letters[i]].toLowerCase() === key);
    if (hit >= 0 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      if (!items[hit].disabled) run(items[hit]);
      return;
    }
    const buttons = [...(panel.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not(:disabled)") ?? [])];
    const now = buttons.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      const next = now < 0 ? (step > 0 ? 0 : buttons.length - 1) : (now + step + buttons.length) % buttons.length;
      buttons[next]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      onClose();
    }
  }

  const groups: ReactNode[] = [];
  let n = 0;
  at.menu.forEach((group, index) => {
    if (index > 0) groups.push(<div key={`line-${index}`} role="separator" className="mx-sm my-1 h-px bg-hairline" />);
    for (const item of group) {
      const Icon = item.icon;
      const letter = letters[n++];
      groups.push(
        <button
          key={`${index}-${item.label}`}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={cn(MENU_ITEM, "disabled:pointer-events-none disabled:text-neutral-400")}
          aria-keyshortcuts={letter >= 0 ? item.label[letter].toUpperCase() : undefined}
          onClick={() => run(item)}
        >
          <Icon className={cn(MENU_ICON, item.disabled && "text-neutral-300")} aria-hidden="true" />
          <span className="flex-1">
            {letter < 0 ? (
              item.label
            ) : (
              <>
                {item.label.slice(0, letter)}
                <u className="underline-offset-2">{item.label[letter]}</u>
                {item.label.slice(letter + 1)}
              </>
            )}
          </span>
          {item.keys && <span className="pl-md text-caption text-neutral-500">{item.keys}</span>}
        </button>,
      );
    }
  });

  return (
    <div
      ref={panel}
      role="menu"
      aria-label="Actions"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={place}
      className={cn(
        "fixed z-[80] min-w-56 rounded-lg outline-none border border-hairline bg-raised p-1 shadow-xl shadow-black/10",
        "animate-[dropdown-in_120ms_cubic-bezier(0.2,0,0,1)] motion-reduce:animate-none",
      )}
    >
      {groups}
    </div>
  );
}
