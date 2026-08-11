// Content-only skeleton — the header lives in layout.tsx and never unmounts.
// Mirrors <main className="mx-auto w-full min-w-0 max-w-page px-page-x py-10">
// from page.tsx, down to PageHeader's icon + title + "Since" badge + action
// button silhouette, so the loading state reads as *this* page arriving, not
// a generic template. --sk-delay staggers the shimmer phase per bar (a loose
// ripple instead of one mechanical wipe) — everything else appears instantly,
// no entrance animation: the site is meant to feel instant, not choreographed.

export default function DocsSkeleton() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-page px-page-x py-10" role="status" aria-label="Loading…">
      {/* Plain div, not <article> — this is a placeholder, not real document
          content. While Next streams in the real page, this and the real
          `<article className="prose">` from page.tsx can be in the DOM at
          the same time (the real one behind `hidden` until React reveals
          it). Two `<article>` landmarks confuses reader-mode heuristics
          (Safari Reader, etc.), which expect exactly one — so the fake one
          stays a `<div>`. */}
      <div>
        {/* Header — mirrors PageHeader.tsx: icon + name + "Since" badge on
            the left, the copy-as-markdown action pill on the right. */}
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3 border-b border-border pb-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="sk bg-muted size-8 shrink-0 rounded-md" style={{ "--sk-delay": "-0.2s" } as React.CSSProperties} />
            <div className="sk bg-muted h-7 w-56 rounded-md" style={{ "--sk-delay": "-0.5s" } as React.CSSProperties} />
            <div className="sk bg-muted h-5 w-16 rounded-md" style={{ "--sk-delay": "-0.9s" } as React.CSSProperties} />
          </div>
          <div className="sk bg-muted h-8 w-40 rounded-lg shrink-0" style={{ "--sk-delay": "-1.3s" } as React.CSSProperties} />
        </div>

        {/* Intro paragraph — prose p spacing: my-5 */}
        <div className="space-y-2 mb-5">
          <div className="sk bg-muted h-4 w-full rounded-sm" style={{ "--sk-delay": "0s" } as React.CSSProperties} />
          <div className="sk bg-muted h-4 w-[94%] rounded-sm" style={{ "--sk-delay": "-0.4s" } as React.CSSProperties} />
          <div className="sk bg-muted h-4 w-4/5 rounded-sm" style={{ "--sk-delay": "-0.8s" } as React.CSSProperties} />
        </div>

        <div className="space-y-2 mb-5">
          <div className="sk bg-muted h-4 w-full rounded-sm" style={{ "--sk-delay": "-1.1s" } as React.CSSProperties} />
          <div className="sk bg-muted h-4 w-11/12 rounded-sm" style={{ "--sk-delay": "-0.2s" } as React.CSSProperties} />
        </div>

        {/* Code block — the small corner mark nods to CodePanel's "Copy" button. */}
        <div className="relative my-5 h-36 w-full">
          <div className="sk bg-muted absolute inset-0 rounded-lg" style={{ "--sk-delay": "-0.6s" } as React.CSSProperties} />
          <div className="sk bg-muted/70 absolute right-2 top-2 h-6 w-14 rounded-md" style={{ "--sk-delay": "-1s" } as React.CSSProperties} />
        </div>

        <div className="space-y-2 mb-5">
          <div className="sk bg-muted h-4 w-full rounded-sm" style={{ "--sk-delay": "-0.3s" } as React.CSSProperties} />
          <div className="sk bg-muted h-4 w-3/4 rounded-sm" style={{ "--sk-delay": "-0.7s" } as React.CSSProperties} />
        </div>

        {/* h2 heading */}
        <div className="mb-4 mt-8">
          <div className="sk bg-muted h-5 w-1/3 rounded-md" style={{ "--sk-delay": "-1.4s" } as React.CSSProperties} />
        </div>

        <div className="space-y-2 mb-5">
          <div className="sk bg-muted h-4 w-full rounded-sm" style={{ "--sk-delay": "-0.5s" } as React.CSSProperties} />
          <div className="sk bg-muted h-4 w-[92%] rounded-sm" style={{ "--sk-delay": "-0.1s" } as React.CSSProperties} />
          <div className="sk bg-muted h-4 w-2/3 rounded-sm" style={{ "--sk-delay": "-0.9s" } as React.CSSProperties} />
        </div>

        {/* Another code block */}
        <div className="relative my-5 h-24 w-full">
          <div className="sk bg-muted absolute inset-0 rounded-lg" style={{ "--sk-delay": "-1.2s" } as React.CSSProperties} />
          <div className="sk bg-muted/70 absolute right-2 top-2 h-6 w-14 rounded-md" style={{ "--sk-delay": "-0.4s" } as React.CSSProperties} />
        </div>

        <div className="space-y-2">
          <div className="sk bg-muted h-4 w-full rounded-sm" style={{ "--sk-delay": "-0.7s" } as React.CSSProperties} />
          <div className="sk bg-muted h-4 w-4/5 rounded-sm" style={{ "--sk-delay": "-1.5s" } as React.CSSProperties} />
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </main>
  );
}
