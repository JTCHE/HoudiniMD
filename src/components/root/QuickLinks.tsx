/**
 * The four category quick links below the hero.
 *
 * The row overhangs the page text axis by `md` on both sides, so only the hover
 * surface goes past the axis while the icons and the titles stay on it.
 *
 * The hairline separates the tiles and never draws an outer edge, so it is
 * set on the tile that follows it: a vertical rule on every column but the
 * first on wide screens. No rule between the two rows on small screens.
 */
import { QUICK_LINKS, type QuickLink } from "@/lib/landing/collections";
import { cn } from "@/lib/utils";
import DocLink from "../docs/DocLink";
import DocIconClient from "../docs/markdown/DocIconClient";

function QuickLinkTile({ link, index }: { link: QuickLink; index: number }) {
  const isFirstColumnOnDesktop = index === 0;

  return (
    <li className={cn("flex", !isFirstColumnOnDesktop && "sm:border-l sm:border-hairline")}>
      <DocLink
        href={`/${link.path}`}
        underline={false}
        fullWidth
        className={cn(
          "flex flex-col gap-xs px-md py-sm select-none md:py-ms",
          "transition-colors duration-(--duration-fast) motion-reduce:transition-none",
          // `pointer-hover` comes after `active` in the sheet, so the hover
          // shade must step aside while the tile is pressed.
          "pointer-hover:not-active:bg-muted active:bg-neutral-200",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        <span className="flex items-end gap-sm">
          <DocIconClient
            src={link.icon}
            alt=""
            className="size-lg shrink-0 select-none rounded-xs"
          />
          <span className="text-title font-semibold text-foreground">{link.title}</span>
        </span>
        <span className="text-meta text-pretty text-muted-foreground line-clamp-1">{link.description}</span>
      </DocLink>
    </li>
  );
}

export function QuickLinks({ className }: { className?: string }) {
  return (
    <ul className={cn("-mx-md -my-sm md:my-ms grid grid-cols-2 overflow-none sm:grid-cols-4", className)}>
      {QUICK_LINKS.map((link, index) => (
        <QuickLinkTile
          key={link.path}
          link={link}
          index={index}
        />
      ))}
    </ul>
  );
}
