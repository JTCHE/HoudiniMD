import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/doc-pages";

function renderChain(items: Crumb[]) {
  return items.map((item, i) => {
    const isLast = i === items.length - 1;
    return (
      <span key={`${item.href ?? item.label}-${i}`} className="inline-flex items-center">
        {item.href ? (
          <Link href={item.href} className="hover:text-foreground transition-colors">
            {item.label}
          </Link>
        ) : (
          <span className={isLast ? "text-foreground cursor-default" : undefined}>{item.label}</span>
        )}
        {!isLast && (
          <ChevronRight className="mx-1 size-3.5 shrink-0 text-muted-foreground/40" aria-hidden="true" />
        )}
      </span>
    );
  });
}

/**
 * The whole path when it fits, else the last three crumbs, else the last two.
 * A container query cannot measure text, so each chain's width is estimated
 * from its characters: 7px each at text-sm (measured 6.3, rounded up), and
 * 22px for each chevron.
 */
export function Breadcrumbs({ chain }: { chain: Crumb[] }) {
  if (!chain.length) return null;
  const width = (items: Crumb[]) =>
    7 * items.reduce((total, item) => total + item.label.length, 0) + 22 * Math.max(items.length - 1, 0);
  const three = chain.slice(-3);

  return (
    <span className="text-sm text-muted-foreground">
      <style>{`
        .bc-full, .bc-three { display: none; }
        .bc-two { display: inline; }
        @container (min-width: ${width(three)}px) { .bc-two { display: none; } .bc-three { display: inline; } }
        @container (min-width: ${width(chain)}px) { .bc-three { display: none; } .bc-full { display: inline; } }
      `}</style>
      <span className="bc-full">{renderChain(chain)}</span>
      <span className="bc-three">{renderChain(three)}</span>
      <span className="bc-two">{renderChain(chain.slice(-2))}</span>
    </span>
  );
}
