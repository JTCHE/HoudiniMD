import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { showToast } from "@/components/ui/toast-notification";
import { isCommand, useHotkey } from "@/lib/hotkeys";
import { pastedPath, resolve, titles, type Hit } from "@/lib/search";
import { useSearch } from "@/lib/use-search";
import {
  SEARCH_LIST_CLASS,
  SearchResultList,
  rowPath,
  toRows,
  type Row,
} from "@/components/search/SearchResultList";

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
  const [selected, setSelected] = useState(0);
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

  useHotkey((event) => {
    if (isCommand(event) && event.key === "k") {
      event.preventDefault();
      setOpen((was) => !was);
    }
    if (event.key === "Escape") setOpen(false);
  });

  // Reset the query and read the recents the moment `open` flips true, during
  // render rather than in an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
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
    setSelected(0);
  }

  const empty = trimmed === "";
  const results = empty ? recent : hits;
  // A pasted link is already the answer; there is nothing further to search for.
  const searchFor = !empty && !paste;
  // Same flattening the list renders, so the arrow-key indices line up with it.
  const rows = useMemo(() => toRows(results, !empty), [results, empty]);

  const go = useCallback(
    (target: string) => {
      const [base, anchor] = target.split("#");
      if (location.pathname === `/${base}`) {
        const element = anchor ? document.getElementById(anchor) : null;
        if (element) element.scrollIntoView({ behavior: "smooth" });
        else showToast("Already on this page");
        setOpen(false);
        return;
      }
      flushSync(() => setOpen(false));
      navigate(`/${target}`);
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
      go(rowPath(row));
    },
    [go, location.pathname],
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
    go(hit.path);
  }, [trimmed, hits, go, location.pathname]);

  function onKeyDown(event: React.KeyboardEvent) {
    const total = rows.length + (searchFor ? 1 : 0);
    if (total === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((s) => (s + 1) % total);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((s) => (s - 1 + total) % total);
    }
    if (event.key === "Enter") {
      const row = rows[selected];
      if (row) openRow(row);
      else void submit();
    }
  }

  if (!open) return null;

  const showList = rows.length > 0 || searchFor;

  return (
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
            onChange={(e) => setQuery(e.target.value)}
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
            selected={selected}
            onSelect={setSelected}
            onActivate={openRow}
            className={SEARCH_LIST_CLASS}
            rowRounded={false}
            header={
              empty && recent.length > 0 ? (
                <li className="px-4 pt-2 pb-1 text-xs text-muted-foreground/60 select-none">
                  Recent
                </li>
              ) : null
            }
            footer={
              searchFor ? (
                <li>
                  <button
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors text-muted-foreground ${
                      selected === rows.length ? "bg-muted" : "hover:bg-muted/50"
                    }`}
                    onClick={(() => void submit())}
                    onMouseMove={() => setSelected(rows.length)}
                  >
                    <span className="text-xs shrink-0">Search for</span>
                    <span className="text-sm font-mono truncate">&ldquo;{trimmed}&rdquo;</span>
                  </button>
                </li>
              ) : null
            }
          />
        )}

        <div className="px-4 py-2 border-t text-xs text-muted-foreground flex gap-3 [&_span]:space-x-1 space-x-2">
          <span>
            <span>↑↓</span>
            <span>navigate</span>
          </span>
          <span>
            <span>↵</span>
            <span>open</span>
          </span>
          <span>
            <span>esc</span>
            <span>close</span>
          </span>
        </div>
      </div>
      </div>
    </div>
  );
});

export default SearchOverlay;
