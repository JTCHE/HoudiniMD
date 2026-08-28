import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

/** The path of a page is its place in the docs, so the trail is read from it. */
export function Breadcrumbs({ path, version, title }: { path: string; version?: string; title: string }) {
  const segments = path.split("/").filter(Boolean).slice(0, -1);
  const crumbs = [
    { label: version ? `Houdini ${version}` : "Houdini", href: "/" },
    ...segments.map((segment, index) => ({
      label: segment.replace(/-/g, " "),
      href: `/${segments.slice(0, index + 1).join("/")}/index`,
    })),
    { label: title, href: null },
  ];

  return (
    <nav className="flex flex-wrap items-center text-xs text-muted-foreground print:hidden">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${index}`} className="inline-flex items-center">
            {crumb.href ? (
              <Link to={crumb.href} className="capitalize hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-foreground cursor-default">{crumb.label}</span>
            )}
            {!isLast && <ChevronRight className="mx-1 size-3.5 shrink-0 text-muted-foreground/40" aria-hidden="true" />}
          </span>
        );
      })}
    </nav>
  );
}
