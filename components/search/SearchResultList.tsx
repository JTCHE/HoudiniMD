"use client";

/**
 * The result list, shared by the docs search overlay and the homepage field.
 *
 * `SearchResultRow` was already shared, but the model around it was not: how a
 * page expands into its matching sections, and how prose excerpts are fetched,
 * both lived inside the overlay. The homepage therefore drifted into showing a
 * plainer list of the same results. Everything that decides WHAT a result looks
 * like now lives here, and both callers pass the same ranked results in.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchResultRow } from "@/components/search/SearchResultRow";
import { getExcerpt } from "@/lib/search/excerpt";

export interface ListResult {
  path: string;
  title: string;
  summary: string;
  category: string;
  icon?: string;
  /** Sections of the page that matched — rendered as sub-hits beneath it. */
  headings?: { text: string; slug: string }[];
}

/** One selectable line: a page, one of its matching sections, or its prose. */
export interface Row {
  result: ListResult;
  heading?: { text: string; slug: string };
  /** The prose row a page gets when nothing under a heading matched. */
  text?: boolean;
}

/**
 * Flatten pages and their sub-hits into arrow-key order.
 *
 * A page with no matching heading still gets one row for its own prose, so
 * every result can show WHY it matched rather than only its title.
 */
export function toRows(results: ListResult[], withSubHits = true): Row[] {
  if (!withSubHits) return results.map((result) => ({ result }));
  return results.flatMap((result) => [
    { result },
    ...(result.headings?.length
      ? result.headings.map((heading) => ({ result, heading }))
      : [{ result, text: true }]),
  ]);
}

/** Key for the excerpt cache: a page, optionally narrowed to one section. */
export const rowKey = (row: Row) => `${row.result.path}#${row.heading?.slug ?? ""}`;

/**
 * How many rows fetch prose. The list holds ~6 pages and their sub-hits; going
 * deeper spends requests on rows nobody has scrolled to.
 */
const MAX_EXCERPTS = 8;

/**
 * Fetch excerpts for the visible rows, after they have rendered.
 *
 * Results must never wait on this — the list is already correct without it, and
 * it is the one part of search that touches the network per result.
 */
export function useExcerpts(rows: Row[], query: string): Map<string, string> {
  const [excerpts, setExcerpts] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const q = query.trim();
    if (!q) return;

    let cancelled = false;
    void Promise.all(
      rows
        .filter((row) => row.heading || row.text)
        .slice(0, MAX_EXCERPTS)
        .map(async (row) => {
          const key = rowKey(row);
          const text = await getExcerpt(row.result.path, q, row.heading?.text);
          if (text && !cancelled) {
            setExcerpts((prev) => (prev.get(key) === text ? prev : new Map(prev).set(key, text)));
          }
        }),
    );

    return () => {
      cancelled = true;
    };
  }, [rows, query]);

  return excerpts;
}

export function SearchResultList({
  results,
  query,
  selected,
  onSelect,
  onActivate,
  withSubHits = true,
  header,
  footer,
  className,
}: {
  results: ListResult[];
  /** Drives the excerpts; pass "" to skip fetching (recent searches). */
  query: string;
  selected: number;
  onSelect: (index: number) => void;
  onActivate: (result: ListResult, anchor?: string) => void;
  /** Off for lists of pages the reader already chose, where sub-hits are noise. */
  withSubHits?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const rows = useMemo(() => toRows(results, withSubHits), [results, withSubHits]);
  const excerpts = useExcerpts(rows, withSubHits ? query : "");
  const listRef = useRef<HTMLUListElement>(null);

  // Keeping the selected row in view belongs here, not in each caller: the
  // homepage had no such effect and its arrow keys walked off screen. Rows are
  // found by index rather than by child position, so an optional header or
  // footer `li` cannot shift the lookup.
  useEffect(() => {
    const list = listRef.current;
    const row =
      list?.querySelector(`[data-row="${selected}"]`) ??
      // Past the last row is the footer, when a caller supplies one.
      (selected >= rows.length ? list?.lastElementChild : null);
    row?.scrollIntoView({ block: "nearest" });
  }, [selected, rows.length]);

  return (
    <ul ref={listRef} className={className}>
      {header}
      {rows.map((row, i) => (
        <li key={`${rowKey(row)}${row.heading || row.text ? ":sub" : ""}`} data-row={i}>
          <SearchResultRow
            title={
              row.heading
                ? row.heading.text
                : row.text
                  ? row.result.summary || row.result.title
                  : row.result.title
            }
            category={row.result.category}
            icon={row.result.icon}
            sub={Boolean(row.heading || row.text)}
            subKind={row.heading ? "heading" : "text"}
            excerpt={excerpts.get(rowKey(row))}
            query={query}
            active={i === selected}
            onClick={() => onActivate(row.result, row.heading?.slug)}
            onMouseMove={() => onSelect(i)}
          />
        </li>
      ))}
      {footer}
    </ul>
  );
}
