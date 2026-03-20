import type { ProgressEvent } from "@/lib/generator";
import { cn } from "@/lib/utils";

export default function ProgressLogEntry({ event, isLatest }: { event: ProgressEvent; isLatest: boolean }) {
  const isComplete = event.stage === "complete";
  const isError = event.stage === "error";

  return (
    <div
      className={cn(
        "flex items-start gap-2 text-xs",
        isLatest && !isComplete && !isError && "text-foreground",
        !isLatest && "text-muted-foreground",
        isComplete && "text-green-600 dark:text-green-400",
        isError && "text-destructive",
      )}
    >
      <span className={cn("w-4 shrink-0 text-center", isLatest && !isComplete && !isError && "animate-pulse")}>
        {isError ? "✗" : isComplete ? "✓" : isLatest ? "●" : "✓"}
      </span>
      <span className="flex-1 min-w-0">
        <span className="font-medium break-words">{event.message}</span>
        {event.detail && (
          <>
            <br />
            <span className="text-muted-foreground break-all">{event.detail}</span>
          </>
        )}
      </span>
    </div>
  );
}
