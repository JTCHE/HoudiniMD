"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DocsSkeleton from "@/components/docs/DocsSkeleton";
import ProgressLogEntry from "@/components/root/progress-log-entry/ProgressLogEntry";
import type { ProgressEvent } from "@/lib/generator";

// Rendered by page.tsx when content is not yet in R2.
// The header is provided by layout.tsx — this component only covers the content area.
export default function GeneratingPage({ slug }: { slug: string }) {
  const router = useRouter();
  const [progressLog, setProgressLog] = useState<ProgressEvent[]>([
    { stage: "checking-cache", message: "Resolving…", detail: slug },
  ]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sse = new EventSource(`/api/generate?slug=${encodeURIComponent(slug)}`);

    sse.onmessage = (e) => {
      const event = JSON.parse(e.data) as ProgressEvent;
      setProgressLog((prev) => [...prev, event]);
      if (event.stage === "complete") {
        sse.close();
        router.refresh();
      } else if (event.stage === "error") {
        sse.close();
        setError(event.detail ?? event.message);
      }
    };

    sse.onerror = () => {
      sse.close();
      router.refresh();
    };

    return () => sse.close();
  }, [slug, router]);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-sm text-destructive">{error}</p>
      </main>
    );
  }

  return (
    <>
      <DocsSkeleton />
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[55] pointer-events-none w-96 bg-background border shadow-2xl p-3 space-y-1.5">
        {progressLog.map((event, i) => (
          <ProgressLogEntry
            key={i}
            event={event}
            isLatest={i === progressLog.length - 1}
          />
        ))}
      </div>
    </>
  );
}
