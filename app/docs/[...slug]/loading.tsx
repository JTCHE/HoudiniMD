export default function Loading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <a href="/" className="text-xs font-semibold text-foreground">VexLLM</a>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10 space-y-4 animate-pulse">
        <div className="h-8 w-2/3 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
        <div className="h-4 w-4/6 rounded bg-muted" />
        <div className="h-32 w-full rounded bg-muted mt-6" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
      </main>
    </div>
  );
}
