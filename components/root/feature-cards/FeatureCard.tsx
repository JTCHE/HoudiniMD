import { cn } from "@/lib/utils";

interface FeatureCardProps {
  title: string;
  caption: string;
  /** The illustration. It draws freely — the card clips whatever leaves the frame. */
  children: React.ReactNode;
  className?: string;
}

export function FeatureCard({ title, caption, children, className }: FeatureCardProps) {
  return (
    <div className={cn("bg-surface border border-hairline rounded-lg overflow-hidden flex flex-col", className)}>
      {/* The illustration frame is a fixed band, not a min-height. An
          illustration that draws past it is clipped rather than obeyed — the
          help pane is meant to hang off the bottom edge, and letting it set the
          height instead pushed every card in its row taller than the design. */}
      <div className="md:h-24 h-20 shrink-0 overflow-hidden flex items-center justify-center">{children}</div>
      <div className="mt-auto border-t border-hairline px-md py-xs md:py-ms flex flex-col gap-2xs">
        <p className="text-label font-semibold text-foreground">{title}</p>
        <p className="text-caption text-muted-foreground line-clamp-2 lg:line-clamp-none">{caption}</p>
      </div>
    </div>
  );
}
