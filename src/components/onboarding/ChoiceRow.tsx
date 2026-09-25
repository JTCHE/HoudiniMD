import { cn } from "@/lib/utils";
import { Icons } from "@/lib/ui/icons";

/** The margin a list of these gives back, so the text in a row stands on the
    same line as the text above the list: the row's padding and its border
    hang out into the gutter. */
export const CHOICE_HANG = "-mx-[13px]";

/**
 * One row of a list the setup asks the reader to choose from: a Houdini build,
 * an agent. `chosen` is left out for a row that is an action, not a choice.
 */
export function ChoiceRow({
  label,
  detail,
  chosen,
  compact,
  onClick,
}: {
  label: string;
  detail?: string;
  chosen?: boolean;
  /** One chip-high line, as wide as its label: for a list that shares the
      step with a picture. */
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        "flex cursor-interactive items-center gap-sm rounded-lg border bg-neutral-50 px-ms text-left",
        compact ? "h-chip" : "w-full py-md",
        "transition-colors duration-(--duration-fast) pointer-hover:bg-neutral-100 motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        chosen ? "border-neutral-200 shadow-chip" : "border-hairline",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-[15px] leading-[1.52] font-medium",
            chosen ? "text-brand-700" : "text-neutral-700",
          )}
        >
          {label}
        </span>
        {detail && <span className="truncate text-caption text-neutral-400">{detail}</span>}
      </span>
      {chosen && <Icons.chosen className="size-md shrink-0 text-brand-700" />}
    </button>
  );
}
