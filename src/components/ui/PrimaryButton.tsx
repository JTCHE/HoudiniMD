import { cn } from "@/lib/utils";

/**
 * The app's primary control: a raised, dark key.
 *
 * One definition, because it is the same button everywhere — the "Search" key
 * beside the landing field, and the "Continue" key of every onboarding step.
 * The caller states the width and the label; the surface is decided here.
 */
export function PrimaryButton({
  className,
  children,
  type = "button",
  ...rest
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "relative shrink-0 cursor-interactive select-none rounded-lg border border-control-edge",
        "bg-linear-to-b from-control-top to-control-bottom",
        "px-md py-sm text-label text-sm font-semibold whitespace-nowrap text-control-foreground",
        // The sheen along the top edge is what makes the key read as raised.
        // The press drops it and sinks the key by the same 1px, so the two
        // states differ the way a real key does.
        "shadow-control inset-shadow-[0_1px_0_0_var(--control-sheen)]",
        "transition duration-(--duration-fast) active:translate-y-px active:inset-shadow-none",
        "disabled:cursor-wait motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
