import { cn } from "@/lib/utils";

/**
 * The one control beside the search input.
 *
 * It knows nothing about searching. In "paste" mode it asks its owner to fill
 * the field from the clipboard; in "search" mode it is the form's submit
 * button and the form does the rest.
 */
export function PasteSearchButton({
  mode,
  label,
  disabled,
  onPaste,
  className,
}: {
  /** "paste" reads the clipboard first; "search" submits what is already typed. */
  mode: "paste" | "search";
  label: string;
  disabled?: boolean;
  onPaste: () => void;
  className?: string;
}) {
  return (
    <button
      type={mode === "paste" ? "button" : "submit"}
      onClick={mode === "paste" ? onPaste : undefined}
      disabled={disabled}
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
        className,
      )}
    >
      {label}
    </button>
  );
}
