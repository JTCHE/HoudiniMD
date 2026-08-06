import { cn } from "@/lib/utils";
import type { DocChip } from "@/lib/landing/types";
import DocLink from "@/components/docs/DocLink";
import DocIconClient from "@/components/docs/markdown/DocIconClient";

/**
 * One page in the carousel row: its icon and its title, nothing else.
 *
 * The icon is decoration — the title already says where the link goes — so it
 * is hidden from assistive technology rather than described twice.
 */
export function ChipLink({ chip, className }: { chip: DocChip; className?: string }) {
  return (
    <DocLink
    underline={false}
    href={`/docs/${chip.path}`}
    className={cn(
      "inline-flex shrink-0 items-center gap-sm rounded-lg border border-hairline bg-surface px-ms py-sm",
      "transition-colors duration-(--duration-fast) pointer-hover:bg-muted active:bg-neutral-200",
      "focus-visible:ring-2 focus-visible:ring-ring",
      className,
    )}
    >
      <DocIconClient
        src={chip.icon}
        alt=""
        className="size-md shrink-0 select-none rounded-xs"
      />
      <span className="whitespace-nowrap text-meta font-medium">{chip.title}</span>
    </DocLink>
  );
}
