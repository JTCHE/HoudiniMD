// Content-only skeleton — the header lives in layout.tsx and never unmounts.
// Mirrors <main className="mx-auto max-w-4xl px-6 py-10"> from page.tsx.

export default function DocsSkeleton() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10" role="status" aria-label="Loading…">
      <article>
        {/* h1: text-2xl font-bold tracking-tight border-b pb-3 mb-6 */}
        <div className="border-b border-border pb-3 mb-6">
          <div className="sk bg-muted h-7 w-2/5" />
        </div>

        {/* Intro paragraph — prose p spacing: my-5 */}
        <div className="space-y-2 mb-5">
          <div className="sk bg-muted h-4 w-full" />
          <div className="sk bg-muted h-4 w-[94%]" />
          <div className="sk bg-muted h-4 w-4/5" />
        </div>

        <div className="space-y-2 mb-5">
          <div className="sk bg-muted h-4 w-full" />
          <div className="sk bg-muted h-4 w-11/12" />
        </div>

        {/* Code block */}
        <div className="sk my-5 h-36 w-full bg-card" />

        <div className="space-y-2 mb-5">
          <div className="sk bg-muted h-4 w-full" />
          <div className="sk bg-muted h-4 w-3/4" />
        </div>

        {/* h2 heading */}
        <div className="sk bg-muted mb-4 mt-8 h-5 w-1/3" />

        <div className="space-y-2 mb-5">
          <div className="sk bg-muted h-4 w-full" />
          <div className="sk bg-muted h-4 w-[92%]" />
          <div className="sk bg-muted h-4 w-2/3" />
        </div>

        {/* Another code block */}
        <div className="sk my-5 h-24 w-full bg-card" />

        <div className="space-y-2">
          <div className="sk bg-muted h-4 w-full" />
          <div className="sk bg-muted h-4 w-4/5" />
        </div>
      </article>

      <span className="sr-only">Loading…</span>
    </main>
  );
}
