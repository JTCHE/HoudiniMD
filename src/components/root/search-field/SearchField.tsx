import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { AnimatedPlaceholder } from "./AnimatedPlaceholder";
import { PasteSearchButton } from "./PasteSearchButton";

/**
 * The search field: one input and one key.
 *
 * Until the index lands it opens a help path outright — `nodes/sop/box`.
 * See spec: Local — SQLite FTS5 Index.
 */
export function SearchField({ className, autoFocus = true }: { className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
    // Mount only: refocusing on every render would fight the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  function open(text: string) {
    const path = text.trim().replace(/^https?:\/\/[^/]+\/docs\/houdini\//, "").replace(/^\/+/, "");
    if (path) navigate(`/${path}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    open(query);
  }

  const mode = query.trim() ? "search" : "paste";
  const buttonLabel = mode === "search" ? "Open" : "Paste & Open";

  return (
    // The field overhangs its column by exactly its own padding, so the input
    // text sits on the same left axis as the text above it and only the
    // surface reaches past.
    <div
      ref={containerRef}
      className={cn("relative -mr-xs -ml-ms lg:-ml-md", className)}
    >
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
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Open a page of the Houdini documentation"
            aria-describedby={errorId}
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

        <PasteSearchButton
          mode={mode}
          label={buttonLabel}
          onPaste={() => navigator.clipboard.readText().then(open)}
        />
      </form>

    </div>
  );
}
