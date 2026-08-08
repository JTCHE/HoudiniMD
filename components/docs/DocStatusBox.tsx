import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface DocStatusBoxProps {
  icon: LucideIcon;
  path: string;
  title: string;
  children?: ReactNode;
}

// Shared shell for full-page "nothing to show here" states (not-found, error).
// One place to restyle both from — same dashed box, icon tile, mono path line,
// and heading structure.
export default function DocStatusBox({ icon: Icon, path, title, children }: DocStatusBoxProps) {
  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col justify-center px-page-x py-10">
      {/* Negative margin cancels the box's own (equal) padding, so the border
          bleeds past the page gutter while the text lands back exactly on it
          — same axis as the header/footer (same trick as .callout, and the
          same 1rem bleed amount, so the border stops short of the viewport
          edge instead of touching it). */}
      <div className="-mx-4 flex flex-col items-start gap-6 rounded-xl border border-dashed px-4 py-12">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </div>

        <div className="space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{path}</p>
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>

        {children}
      </div>
    </main>
  );
}
