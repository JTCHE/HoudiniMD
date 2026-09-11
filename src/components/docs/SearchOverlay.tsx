import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Keycap, SMALL_KEY } from "@/components/ui/Keycap";
import { showToast } from "@/components/ui/toast-notification";
import { invoke, inTauri } from "@/lib/backend";
import { COMMAND_KEY, isCommand, isTyping, useHotkey } from "@/lib/hotkeys";
import { Icons } from "@/lib/ui/icons";
import { toggleTheme, useTheme } from "@/lib/ui/theme";
import { pastedAnchor, pastedPath, resolve, titles, type Hit } from "@/lib/search";
import { useSearch } from "@/lib/use-search";
import { used } from "@/lib/telemetry";
import {
  SEARCH_LIST_CLASS,
  SearchResultList,
  rowPath,
  toRows,
  type Row,
} from "@/components/search/SearchResultList";

const FOOTER_HINTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["↑", "↓"], label: "navigate" },
  { keys: ["↵"], label: "open" },
  { keys: ["esc"], label: "close" },
];

export interface SearchOverlayRef {
  openSearch: () => void;
}

const RECENT_SEARCHES_KEY = "houdinimd:recent-searches";
const MAX_RECENT = 5;

function getRecentSearches(): Hit[] {
  try {
    return JSON.parse(sessionStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(hit: Hit) {
  const existing = getRecentSearches().filter((r) => r.path !== hit.path);
  const updated = [hit, ...existing].slice(0, MAX_RECENT);
  sessionStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

/** An action the overlay offers beside the pages. */
interface Command {
  label: string;
  /** The words a query can start, besides the words of the label. */
  words: string[];
  icon: (typeof Icons)[keyof typeof Icons];
  shortcut?: string;
  run: () => void;
}

/** The commands a query names. Two letters at least, so the first letter of
    a search does not put a command over the pages. */
function matchCommands(all: Command[], query: string): Command[] {
  const typed = query.trim().toLowerCase();
  if (typed.length < 2) return [];
  return all.filter((command) =>
    [...command.label.toLowerCase().split(" "), ...command.words].some((word) => word.startsWith(typed)),
  );
}

/**
 * The search a reader opens from a page, over the page they are reading.
 *
 * The landing field is the same search in a different place: both go through
 * `useSearch` and both draw with `SearchResultList`, so neither can grow a
 * plainer answer than the other.
 */
const SearchOverlay = forwardRef<SearchOverlayRef, object>(function SearchOverlay(_, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [direct, setDirect] = useState<Hit | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useImperativeHandle(ref, () => ({
    openSearch: () => {
      // The focus call needs the input on screen, so the open is committed
      // before it runs and not at the end of the render pass.
      flushSync(() => setOpen(true));
      inputRef.current?.focus();
    },
  }));

  // A letter typed on the page is the start of a search: the overlay opens
  // with that letter in it. A key with a modifier is a shortcut, and a key in
  // a field or a menu belongs to that control.
  const seed = useRef("");
  useHotkey((event) => {
    if (isCommand(event) && event.key === "k") {
      event.preventDefault();
      setOpen((was) => !was);
    }
    if (event.key === "Escape") setOpen(false);
    const target = event.target as HTMLElement;
    if (
      !open &&
      !event.defaultPrevented &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      /^[\p{L}\p{N}]$/u.test(event.key) &&
      !isTyping(target) &&
      !target.closest("[role=menu], [role=listbox], [role=dialog]")
    ) {
      event.preventDefault();
      seed.current = event.key;
      setOpen(true);
    }
  });

  // Reset the query and read the recents the moment `open` flips true, during
  // render rather than in an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      used("search");
      setQuery(seed.current);
      seed.current = "";
      const here = location.pathname.replace(/^\/+/, "");
      setRecent(getRecentSearches().filter((hit) => hit.path !== here));
    }
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // A pasted SideFX link names a page outright, so it does not go to the
  // search at all — it is looked up in the title list by path.
  const trimmed = query.trim();
  const paste = trimmed !== "" && pastedPath(trimmed) !== trimmed;

  useEffect(() => {
    if (!paste) {
      setDirect(null);
      return;
    }
    let live = true;
    const wanted = pastedPath(trimmed);
    titles().then((all) => {
      if (live) setDirect(all.find((hit) => hit.path === wanted) ?? null);
    });
    return () => {
      live = false;
    };
  }, [paste, trimmed]);

  const { hits: live } = useSearch(paste ? "" : query);
  const hits = useMemo(
    () => (paste ? (direct ? [direct] : []) : live),
    [paste, direct, live],
  );

  // Reset the selection whenever the result set changes, during render rather
  // than in an effect, so the arrow keys never point at a stale row.
  const [shown, setShown] = useState(hits);
  if (hits !== shown) {
    setShown(hits);
    setPicked(null);
  }

  const empty = trimmed === "";
  const results = empty ? recent : hits;
  // A pasted link is already the answer; there is nothing further to search for.
  const searchFor = !empty && !paste;
  // Same flattening the list renders, so the arrow-key indices line up with it.
  const rows = useMemo(() => toRows(results, !empty), [results, empty]);

  // Commands go above the pages. Their names are generic, so they seldom
  // stand in front of a page the reader wanted.
  const theme = useTheme();
  const commands = useMemo(() => {
    const all: Command[] = [
      { label: "Home", words: ["start"], icon: Icons.home, run: () => navigate("/") },
      { label: "Bookmarks", words: ["saved"], icon: Icons.bookmark, run: () => navigate("/?tab=bookmarks") },
      { label: "Recent pages", words: ["history"], icon: Icons.recent, run: () => navigate("/?tab=recents") },
      theme === "dark"
        ? { label: "Light theme", words: ["theme", "mode"], icon: Icons.themeLight, run: toggleTheme }
        : { label: "Dark theme", words: ["theme", "mode"], icon: Icons.themeDark, run: toggleTheme },
    ];
    if (inTauri) {
      all.push({
        label: "New window",
        words: [],
        icon: Icons.newWindow,
        shortcut: `${COMMAND_KEY} N`,
        run: () => void invoke("new_window").catch(() => {}),
      });
    }
    return paste ? [] : matchCommands(all, query);
  }, [navigate, theme, paste, query]);
  // The arrow keys walk the commands first, then the rows, then "Search for".
  // A command is picked at the start only when the query is one of its whole
  // words: "bo" is more often Box than Bookmarks.
  const skip = commands.length;
  const typed = trimmed.toLowerCase();
  const exact = commands.findIndex((command) =>
    [...command.label.toLowerCase().split(" "), ...command.words].includes(typed),
  );
  const selected = picked ?? (exact >= 0 ? exact : rows.length > 0 ? skip : 0);

  const runCommand = useCallback((command: Command) => {
    flushSync(() => setOpen(false));
    command.run();
  }, []);

  const go = useCallback(
    (target: string, find?: string) => {
      const [base, anchor] = target.split("#");
      // An excerpt goes through the router even to the open page: the page
      // finds the words and marks them. See `flashText`.
      if (location.pathname === `/${base}` && !find) {
        const element = anchor ? document.getElementById(anchor) : null;
        if (element) element.scrollIntoView({ behavior: "smooth" });
        else showToast("Already on this page");
        setOpen(false);
        return;
      }
      flushSync(() => setOpen(false));
      navigate(`/${target}`, { state: find ? { find } : undefined });
    },
    [location.pathname, navigate],
  );

  const openRow = useCallback(
    (row: Row) => {
      // Recents store the page, never the section the reader happened to
      // enter it by.
      if (location.pathname !== `/${row.hit.path}`) {
        saveRecentSearch({ ...row.hit, headings: undefined });
      }
      // A pasted link keeps the section it names: `…/cacheif#how-to` opens
      // the page at How to.
      go(paste && !row.section ? `${row.hit.path}${pastedAnchor(trimmed)}` : rowPath(row), row.section?.excerpt);
    },
    [go, location.pathname, paste, trimmed],
  );

  /**
   * Enter with no row picked. A path or a pasted link names a page; anything
   * else has to be a row of the list. Text that is neither says so and stays
   * put — opening `/cptp` and letting the page report itself missing tells the
   * reader their query is wrong when the search is what fell short.
   */
  const submit = useCallback(async () => {
    if (!trimmed) return;
    const all = await titles();
    const hit = resolve(all, trimmed, hits[0]);
    if (!hit) {
      showToast(`Nothing in this Houdini build matches “${trimmed}”.`, "error");
      return;
    }
    if (location.pathname !== `/${hit.path}`) saveRecentSearch({ ...hit, headings: undefined });
    go(`${hit.path}${pastedAnchor(trimmed)}`);
  }, [trimmed, hits, go, location.pathname]);

  function onKeyDown(event: React.KeyboardEvent) {
    const total = skip + rows.length + (searchFor ? 1 : 0);
    if (total === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPicked((selected + 1) % total);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setPicked((selected - 1 + total) % total);
    }
    if (event.key === "Enter") {
      const row = rows[selected - skip];
      if (selected < skip) runCommand(commands[selected]);
      else if (row) openRow(row);
      else void submit();
    }
  }

  if (!open) return null;

  const showList = skip > 0 || rows.length > 0 || searchFor;

  // Rendered to `document.body`, not in place: the scroll column this
  // component sits under carries `@container` (`container-type: inline-size`),
  // which per the CSS Containment spec makes it the containing block for any
  // `position: fixed` descendant. Left in place, "fixed" meant that column's
  // box, not the window — the scrim missed the sidebar and status bar, and
  // the column's own scroll position moved when this mounted. A portal keeps
  // `fixed` meaning the viewport and keeps this out of that column entirely.
  return createPortal(
    <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)}>
      {/* A plain scrim, not a blurred one. A backdrop-filter over the whole
          window is drawn again on every keystroke: it made a keystroke here
          cost 71ms against 31ms in the landing field. */}
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative h-full flex items-start justify-center pt-4 sm:pt-[20vh] pointer-events-none">
      <div
        // transform-gpu keeps the panel on a layer of its own, so a keystroke
        // does not draw the page under it again.
        className="w-full max-w-overlay mx-4 bg-background border rounded-xl shadow-2xl overflow-hidden pointer-events-auto transform-gpu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b">
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="on"
            spellCheck={true}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search docs or paste a SideFX URL…"
            // [&::-webkit-search-cancel-button]:appearance-none hides the
            // native clear glyph; we render our own thin X.
            className="w-full px-4 py-3 pr-11 text-sm bg-transparent outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={(() => {
                setQuery("");
                inputRef.current?.focus();
              })}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {showList && (
          <SearchResultList
            hits={results}
            query={empty ? "" : query}
            // Recents are pages the reader already picked; their old heading
            // hits and excerpts are noise.
            withSubHits={!empty}
            selected={selected - skip}
            onSelect={(index) => setPicked(index + skip)}
            onActivate={openRow}
            className={SEARCH_LIST_CLASS}
            rowRounded={false}
            header={
              empty && recent.length > 0 ? (
                <li className="px-4 pt-2 pb-1 text-xs text-muted-foreground/60 select-none">
                  Recent
                </li>
              ) : skip > 0 ? (
                <>
                  <li className="px-4 pt-2 pb-1 text-xs text-muted-foreground/60 select-none">Commands</li>
                  {commands.map((command, i) => (
                    <li key={command.label}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          selected === i ? "bg-muted" : "hover:bg-muted/50"
                        }`}
                        onClick={() => runCommand(command)}
                        onMouseMove={() => setPicked(i)}
                      >
                        <span className="grid size-5 shrink-0 place-items-center text-muted-foreground">
                          <command.icon className="size-[17px]" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{command.label}</span>
                        {command.shortcut && (
                          <kbd className="shrink-0 font-sans text-xs text-muted-foreground">{command.shortcut}</kbd>
                        )}
                      </button>
                    </li>
                  ))}
                </>
              ) : null
            }
            footer={
              searchFor ? (
                <li>
                  <button
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors text-muted-foreground ${
                      selected === skip + rows.length ? "bg-muted" : "hover:bg-muted/50"
                    }`}
                    onClick={(() => void submit())}
                    onMouseMove={() => setPicked(skip + rows.length)}
                  >
                    <span className="text-xs shrink-0">Search for</span>
                    <span className="text-sm font-mono truncate">&ldquo;{trimmed}&rdquo;</span>
                  </button>
                </li>
              ) : null
            }
          />
        )}

        {/* The mark on the left, the keys on the right, drawn as the status
            bar draws them. */}
        <div className="flex items-center gap-md border-t px-4 py-2 select-none">
          <BrandLogo className="h-4 w-auto opacity-60" />
          <div className="ml-auto flex items-center gap-md text-meta text-neutral-500">
            {FOOTER_HINTS.map((hint) => (
              <span key={hint.label} className="flex items-center gap-xs">
                {hint.keys.map((key) => (
                  <Keycap key={key} className={SMALL_KEY}>
                    {key}
                  </Keycap>
                ))}
                <span className="ml-2xs">{hint.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
});

export default SearchOverlay;
