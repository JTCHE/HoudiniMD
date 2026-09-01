import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { bodies, match, pastedPath, resolve, titles, type Hit } from "@/lib/search";
import {
  SEARCH_DROPDOWN_CLASS,
  SearchResultList,
  rowPath,
  toRows,
} from "@/components/search/SearchResultList";
import { AnimatedPlaceholder } from "./AnimatedPlaceholder";
import { PasteSearchButton } from "./PasteSearchButton";

/** The body search waits this long after the last key. The title pick does not
 *  wait at all — it reads a list that is already in memory. */
const BODY_SEARCH_DELAY = 120;

/**
 * The search field: one input, one key, and the list it opens.
 *
 * Two paths, as the spec says. The titles come back from Rust once and are
 * picked from in memory, so the list answers every keystroke. The body text is
 * searched in SQLite with FTS5, a moment behind, and its hits are added under
 * the title hits. See spec: Local — SQLite FTS5 Index.
 */
export function SearchField({ className, autoFocus = true }: { className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const errorId = useId();

  // The list expands each page into its matching sections, so the arrow keys
  // count rows and not results.
  const rows = toRows(hits);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
    // Mount only: refocusing on every render would fight the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  // The list is filled twice for one query: the titles at once, then the body
  // hits under them. `live` drops the answer to a query the reader has already
  // typed past.
  useEffect(() => {
    const wanted = query.trim();
    if (!wanted) {
      setHits([]);
      setOpen(false);
      return;
    }
    let live = true;
    setSelected(0);

    const show = (found: Hit[]) => {
      setHits(found);
      setOpen(found.length > 0);
    };

    titles().then((all) => {
      if (live) show(match(all, wanted));
    });

    const timer = window.setTimeout(async () => {
      const [all, found] = await Promise.all([titles(), bodies(wanted)]);
      if (!live) return;
      const picked = match(all, wanted);
      const seen = new Set(picked.map((hit) => hit.path));
      show([...picked, ...found.filter((hit) => !seen.has(hit.path))]);
    }, BODY_SEARCH_DELAY);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  function go(path: string) {
    setOpen(false);
    navigate(`/${path}`);
  }

  /**
   * Everything typed goes through here, so nothing can navigate on a guess.
   * A path or a pasted link names a page; anything else has to be a row of the
   * list. Text that is neither says so and stays put — opening `/cptp` and
   * letting the page report itself missing tells the reader their query is
   * wrong when the search is what fell short.
   */
  async function submit(text: string) {
    const wanted = text.trim();
    if (!wanted) return;
    const all = await titles();
    const hit = resolve(all, wanted, rows[selected]?.hit);
    if (!hit) {
      setError(`Nothing in this Houdini build matches “${wanted}”.`);
      return;
    }
    // A row of the list may name a heading of the page, not only the page.
    go(open && rows[selected]?.hit === hit ? rowPath(rows[selected]) : hit.path);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(query);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || rows.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSelected((current) => (current + step + rows.length) % rows.length);
    }
  }

  function changeQuery(value: string) {
    setQuery(value);
    setError("");
  }

  async function pasteAndSearch() {
    const text = await navigator.clipboard.readText().catch(() => "");
    if (!text.trim()) return;
    changeQuery(text);
    // A pasted link is a destination, so it opens without waiting for the list.
    if (pastedPath(text) !== text.trim()) void submit(text);
  }

  const mode = query.trim() ? "search" : "paste";
  const buttonLabel = mode === "search" ? "Search" : "Paste & Search";

  return (
    // The field overhangs its column by exactly its own padding, so the input
    // text sits on the same left axis as the text above it and only the
    // surface reaches past.
    <div ref={containerRef} className={cn("relative -mr-xs -ml-ms lg:-ml-md", className)}>
      {error && (
        <p id={errorId} className="mb-sm ml-ms text-meta text-destructive lg:ml-md">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        role="search"
        className={cn(
          "relative isolate flex items-center gap-sm overflow-hidden rounded-xl",
          "bg-surface-sunken shadow-field",
          // Two edge lines, one bevel. Call `d` the step the fill sits below
          // the page. The OUTER line is a further `d` down — the page falling
          // away — and the INNER line is the page value itself, the lit lip of
          // the recess. Light mode gets both from the ramp directly. Dark mode
          // cannot: below its page there is only black, and a 1px line the
          // strict rule's width disappears on an emissive screen, so the lip
          // takes the next step up the ramp instead of the page step.
          "border border-hairline dark:border-black",
          "ring-1 ring-inset ring-neutral-0 dark:ring-neutral-100",
          // The focus ring the field takes on behalf of the input it holds.
          "has-[input:focus-visible]:ring-1 has-[input:focus-visible]:ring-neutral-200",
          "py-xs pr-xs pl-md",
        )}
      >
        {/* Depth across the fill, straight off the design: the two ends and a
            flat plateau between 38% and 60%. The plateau is what keeps it a
            shallow band rather than a sweep. The geometry is one shape in both
            themes — only the ink and the blend differ, and both are local to
            this element. The two variables name POSITIONS, not roles: `ends` is
            the pair at 10.9% and 89.5%, `plateau` is the flat run between them.
            Which of the two carries the light is what each theme decides, so
            inverting a theme is a swap of ink and never a second gradient.

            Light lights the ends and sinks the plateau. Dark does the reverse —
            light glancing along the floor of the well — and stops carrying ink
            at the ends at all.

            Light mode blends: on a near-white fill soft-light is well behaved
            and gives the shading for free. On the near-black dark fill it is
            not — the curve is close to vertical there, so the layer either does
            nothing or blows out, with nothing in between. Dark mode therefore
            paints instead, lifting by a stated 2%.

            The gradient is a style rather than gradient utilities because
            Tailwind carries one `via` and this needs two middle stops. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-xl",
            "mix-blend-soft-light dark:mix-blend-normal",
            "[--sheen-ends:oklch(1_0_0/50%)] [--sheen-plateau:oklch(0_0_0/50%)]",
            "dark:[--sheen-ends:transparent] dark:[--sheen-plateau:oklch(1_0_0/2%)]",
          )}
          style={{
            backgroundImage:
              "linear-gradient(97.19deg, var(--sheen-ends) 10.9%, var(--sheen-plateau) 38.2%, var(--sheen-plateau) 60.2%, var(--sheen-ends) 89.5%)",
          }}
        />

        <div className="relative min-w-0 flex-1 ">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search the Houdini documentation"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="off"
            spellCheck={true}
            className={cn(
              "w-full min-w-0 border-0 bg-transparent text-label text-sm text-foreground shadow-none outline-none",
              "placeholder:text-transparent disabled:cursor-wait",
            )}
          />
          {!query && <AnimatedPlaceholder />}
        </div>

        <PasteSearchButton mode={mode} label={buttonLabel} onPaste={() => void pasteAndSearch()} />
      </form>

      {open && (
        <SearchResultList
          hits={hits}
          query={query}
          selected={selected}
          onSelect={setSelected}
          onActivate={(row) => go(rowPath(row))}
          className={cn("absolute top-full right-0 left-0 z-10", SEARCH_DROPDOWN_CLASS)}
        />
      )}
    </div>
  );
}
