import { startTransition, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { showToast } from "@/components/ui/toast-notification";
import { DocTooltip, registerSlug } from "./Tooltip";

// The same state hierarchy the table of contents uses: quiet at rest, full
// contrast on hover and on keyboard focus, transition-colors at the project
// default. See TocList.
export const DOC_LINK_CLASS_NAME =
  "underline underline-offset-2 decoration-current/40 text-muted-foreground hover:text-foreground focus-visible:text-foreground transition-colors";

// Shared across all DocLink instances so a link-dense page (1000+ links) uses
// one observer instead of one per link. A link's slug is warmed only once it is
// actually scrolled into view, not on mount.
let linkObserver: IntersectionObserver | null = null;
const observedSlugs = new WeakMap<Element, string>();

function getLinkObserver() {
  if (linkObserver) return linkObserver;
  linkObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const slug = observedSlugs.get(entry.target);
        if (slug) registerSlug(slug);
        linkObserver!.unobserve(entry.target);
        observedSlugs.delete(entry.target);
      }
    },
    { rootMargin: "200px" },
  );
  return linkObserver;
}

/**
 * Every link in the reading view. An app path opens in the window; an external
 * address opens in the reader's browser. Pointing at an app link says what is
 * on the other side of it.
 */
export default function DocLink({
  href,
  children,
  className,
  underline = true,
  fullWidth = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  underline?: boolean;
  fullWidth?: boolean;
}) {
  const classes = cn(underline && DOC_LINK_CLASS_NAME, fullWidth && "w-full", className);
  const [visible, setVisible] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const preventNextClick = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Which visual line the pointer entered on, for wrapped multi-line links —
  // null on keyboard focus, where there is no cursor position to anchor to.
  const hoverPosRef = useRef<{ x: number; y: number } | null>(null);

  const external = /^[a-z]+:/i.test(href);
  const hashAt = href.indexOf("#");
  const anchor = hashAt >= 0 ? href.slice(hashAt + 1) : null;
  // The tooltip names a page, so it needs the page and not the heading in it.
  // A link that is only an anchor has no page of its own: it means this page.
  const path = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const slug = external ? null : path.replace(/^\/+/, "") || null;
  const samePage = !external && (!slug || location.pathname === `/${slug}`);

  useEffect(() => {
    if (!slug || !linkRef.current) return;
    const el = linkRef.current;
    const observer = getLinkObserver();
    observedSlugs.set(el, slug);
    observer.observe(el);
    return () => {
      observer.unobserve(el);
      observedSlugs.delete(el);
    };
  }, [slug]);

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }

  return (
    <span className={cn("relative", fullWidth ? "block w-full" : "inline")}>
      <Link
        ref={linkRef}
        to={href}
        className={classes}
        onMouseDown={(e) => {
          // Navigate on mousedown, which saves the ~100ms between mousedown
          // and click.
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          if (samePage) {
            preventNextClick.current = true;
            if (!anchor) {
              showToast("Already on this page");
              return;
            }
            const target = document.getElementById(decodeURIComponent(anchor));
            if (target) target.scrollIntoView({ behavior: "smooth" });
            else showToast(`This page has no section named "${anchor}"`, "error");
            return;
          }
          startTransition(() => navigate(href));
        }}
        onClick={(e) => {
          if (preventNextClick.current) {
            e.preventDefault();
            preventNextClick.current = false;
          }
        }}
        onMouseEnter={(e) => {
          hoverPosRef.current = { x: e.clientX, y: e.clientY };
          setVisible(true);
        }}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => {
          hoverPosRef.current = null;
          setVisible(true);
        }}
        onBlur={() => setVisible(false)}
      >
        {children}
      </Link>
      {visible && slug && <DocTooltip slug={slug} anchorRef={linkRef} hoverPosRef={hoverPosRef} />}
    </span>
  );
}
