import { cn } from "@/lib/utils";

/** The app's icon as a thing on the page: its own small pair of shadows, the
    same pair as the frame below, and a lift when the pointer finds it. */
export function AppIcon({ className }: { className?: string }) {
  return (
    <img
      src="/icon.svg"
      alt=""
      draggable={false}
      className={cn(
        // A filter, not a box shadow: the icon is a squircle, and only a drop
        // shadow follows its edge.
        // "[filter:drop-shadow(0_0_0.5px_rgba(0,0,0,0.35))_drop-shadow(0_5px_10px_rgba(0,0,0,0.2))]",
        "transition-[translate,scale] duration-300 ease-[cubic-bezier(0.3,1.6,0.5,1)]",
        "pointer-hover:-translate-y-[4%] pointer-hover:scale-[1.04] active:scale-[0.97]",
        "motion-reduce:transition-none",
        className,
      )}
    />
  );
}
