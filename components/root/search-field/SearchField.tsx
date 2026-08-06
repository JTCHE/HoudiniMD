"use client";

import { useEffect, useId, useRef, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { useSearchField } from "@/lib/search/useSearchField";
import { SEARCH_DROPDOWN_CLASS, SearchResultList } from "@/components/search/SearchResultList";
import ProgressLogEntry from "@/components/root/progress-log-entry/ProgressLogEntry";
import { AnimatedPlaceholder } from "./AnimatedPlaceholder";
import { PasteSearchButton } from "./PasteSearchButton";

/**
 * The search field: one input, one key, and a predictive list.
 *
 * Everything it does lives in `useSearchField`; everything here is how it
 * looks. Drop it anywhere a reader needs to reach a page.
 */
export function SearchField({
  className,
  autoFocus = true,
  source = "home",
}: {
  className?: string;
  autoFocus?: boolean;
  /** Where a click on a result is reported from, for search-quality analytics. */
  source?: "overlay" | "home";
}) {
  const field = useSearchField(source);
  const containerRef = useRef<HTMLDivElement>(null);
  const errorId = useId();

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) field.closeDropdown();
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [field.closeDropdown]);

  useEffect(() => {
    if (autoFocus) field.inputRef.current?.focus();
    // Mount only: refocusing on every render would fight the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    field.submit();
  }

  const mode = field.query.trim() ? "search" : "paste";
  const buttonLabel = field.isProcessing
    ? (field.progress?.message ?? "Starting…")
    : mode === "search"
      ? "Search"
      : "Paste & Search";

  return (
    // The field overhangs its column by exactly its own padding, so the input
    // text sits on the same left axis as the text above it and only the
    // surface reaches past.
    <div
      ref={containerRef}
      className={cn("relative -mr-xs -ml-ms lg:-ml-md", className)}
    >
      {field.error && (
        <p
          id={errorId}
          className="mb-sm ml-ms text-meta text-destructive lg:ml-md"
        >
          {field.error}
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
            ref={field.inputRef}
            type="text"
            value={field.query}
            onChange={(event) => field.setQuery(event.target.value)}
            onKeyDown={field.handleKeyDown}
            disabled={field.isProcessing}
            aria-label="Search the Houdini documentation"
            aria-invalid={!!field.error}
            aria-describedby={field.error ? errorId : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={cn(
              "w-full min-w-0 border-0 bg-transparent text-label text-sm text-foreground shadow-none outline-none",
              "placeholder:text-transparent disabled:cursor-wait",
            )}
          />
          {!field.query && <AnimatedPlaceholder />}
        </div>

        <PasteSearchButton
          mode={mode}
          label={buttonLabel}
          disabled={field.isProcessing}
          onPaste={field.pasteAndSearch}
        />
      </form>

      {field.dropdownOpen && (
        <SearchResultList
          results={field.results}
          query={field.query}
          selected={field.selected}
          onSelect={field.setSelected}
          onActivate={(result, anchor) => field.openResult(anchor ? `${result.path}#${anchor}` : result.path)}
          className={cn("absolute top-full right-0 left-0 z-10", SEARCH_DROPDOWN_CLASS)}
        />
      )}

      {field.isProcessing && field.progressLog.length > 0 && (
        <div className="mt-md overflow-hidden rounded-xl border border-hairline bg-surface p-ms">
          <div className="flex flex-col gap-2xs">
            {field.progressLog.map((event, index) => (
              <ProgressLogEntry
                key={index}
                event={event}
                isLatest={index === field.progressLog.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
