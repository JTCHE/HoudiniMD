// Content-only skeleton — the header lives in layout.tsx and never unmounts.
// Mirrors <main className="mx-auto w-full min-w-0 max-w-page px-page-x py-10">
// from page.tsx, and then the order every docs page actually renders in:
// PageHeader (icon + name + "Since" + copy action, summary caption under it),
// the inline "On this page" list, then h2/paragraph prose. Bar heights and gaps
// are the real line box (28px pitch for body text, 26px for TOC rows), so the
// block of grey occupies the same shape the text will.
//
// No code blocks: a fenced block is rare above the fold outside vex/, and a
// large flat --muted rectangle reads as a hole in the page rather than as
// content arriving. --sk-delay staggers the shimmer phase per bar (a loose
// ripple instead of one mechanical wipe) — everything else appears instantly,
// no entrance animation: the site is meant to feel instant, not choreographed.

/** One text line. `w` is any width utility; `d` is the shimmer phase offset. */
function Line({ w, d, h = "h-4" }: { w: string; d: string; h?: string }) {
  return (
    <div
      className={`sk bg-muted ${h} ${w} rounded-sm`}
      style={{ "--sk-delay": d } as React.CSSProperties}
    />
  );
}

export default function DocsSkeleton() {
  return (
    <main
      className="mx-auto w-full min-w-0 max-w-page px-page-x py-10"
      role="status"
      aria-label="Loading…"
    >
      {/* Plain div, not <article> — this is a placeholder, not real document
          content. While Next streams in the real page, this and the real
          `<article className="prose">` from page.tsx can be in the DOM at
          the same time (the real one behind `hidden` until React reveals
          it). Two `<article>` landmarks confuses reader-mode heuristics
          (Safari Reader, etc.), which expect exactly one — so the fake one
          stays a `<div>`. */}
      <div>
        {/* Header — mirrors PageHeader.tsx: icon + name + "Since" badge on the
            left, the copy-as-markdown action pill on the right, and the summary
            caption on its own full-width row beneath them. */}
        <div className="border-b border-border pb-3 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="sk bg-muted size-9 shrink-0 rounded-md"
                style={{ "--sk-delay": "-0.2s" } as React.CSSProperties}
              />
              <Line
                w="w-56"
                d="-0.5s"
                h="h-7"
              />
              <Line
                w="w-16"
                d="-0.9s"
                h="h-5"
              />
            </div>
            <div
              className="sk bg-muted h-8 w-40 rounded-lg shrink-0"
              style={{ "--sk-delay": "-1.3s" } as React.CSSProperties}
            />
          </div>
          
          {/* Caption */}
          <div className="mt-3">
            <Line
              w="w-2/3"
              d="-0.7s"
              h="h-4.5"
            />
          </div>
        </div>

        {/* Inline table of contents — nav.mb-8 -mt-2, a "On this page" label
            over short link rows. Present on all but the shortest pages, and the
            first thing under the header on every one of them. */}
        <div className="mb-8 -mt-2">
          <div className="mb-2">
            <Line
              w="w-28"
              d="-1.1s"
              h="h-3.5"
            />
          </div>
          <div className="space-y-3">
            <Line
              w="w-40"
              d="0s"
              h="h-3.5"
            />
            <Line
              w="w-32"
              d="-0.4s"
              h="h-3.5"
            />
            <Line
              w="w-44"
              d="-0.8s"
              h="h-3.5"
            />
            <Line
              w="w-28"
              d="-1.2s"
              h="h-3.5"
            />
            <Line
              w="w-36"
              d="-1.6s"
              h="h-3.5"
            />
          </div>
        </div>

        {/* h2 — prose gives it 2em above, 1em below. */}
        <div className="mb-4">
          <div
            className="sk bg-muted h-6 w-1/3 rounded-md"
            style={{ "--sk-delay": "-1.4s" } as React.CSSProperties}
          />
        </div>

        <div className="space-y-3 mb-5">
          <Line
            w="w-full"
            d="0s"
          />
          <Line
            w="w-[94%]"
            d="-0.4s"
          />
          <Line
            w="w-4/5"
            d="-0.8s"
          />
        </div>

        <div className="space-y-3 mb-5">
          <Line
            w="w-full"
            d="-1.1s"
          />
          <Line
            w="w-11/12"
            d="-0.2s"
          />
          <Line
            w="w-3/5"
            d="-0.6s"
          />
        </div>

        <div className="mb-4 mt-8">
          <div
            className="sk bg-muted h-6 w-2/5 rounded-md"
            style={{ "--sk-delay": "-0.9s" } as React.CSSProperties}
          />
        </div>

        <div className="space-y-3 mb-5">
          <Line
            w="w-full"
            d="-0.5s"
          />
          <Line
            w="w-[92%]"
            d="-0.1s"
          />
          <Line
            w="w-2/3"
            d="-0.9s"
          />
        </div>

        <div className="space-y-3">
          <Line
            w="w-full"
            d="-0.7s"
          />
          <Line
            w="w-[89%]"
            d="-1.5s"
          />
          <Line
            w="w-3/4"
            d="-0.3s"
          />
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </main>
  );
}
