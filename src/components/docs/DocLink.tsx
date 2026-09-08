import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { warm } from "@/lib/pages";
import { showToast } from "@/components/ui/toast-notification";
import { DocTooltip, registerSlug, usePageMark } from "./Tooltip";
import { Icons } from "@/lib/ui/icons";
import DocIconClient from "./markdown/DocIconClient";

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

// Links pop by weight and contrast, not by colour: 500 against the prose's 400,
// at the top of the ramp where the prose sits at neutral-700. The hover dims
// the whole link, text and rule together, because opacity interpolates in both
// themes and a colour that suits the light theme goes wrong in the dark one.
// Weight and offset never change, so a paragraph never reflows under the pointer.
const LINK =
  "text-brand font-medium no-underline decoration-[0.5px] " +
  "hover:opacity-75 hover:underline transition-opacity transition-colors motion-reduce:transition-none " +
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

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
  mark = true,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  underline?: boolean;
  fullWidth?: boolean;
  /** Draw the page's own icon in front of the name. Off for a link whose
      markup already carries an icon — the card grids, where the help writes
      the image itself. */
  mark?: boolean;
}) {
  const classes = cn(underline && LINK, fullWidth && "w-full", className);
  const [visible, setVisible] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const location = useLocation();
  // The router updates `location` the instant a click fires, a full frame
  // before Page.tsx swaps in the new markdown (it holds the old page on
  // screen to avoid a blank flash — see Page.tsx). A link that reads
  // `location` live sees its own destination as "here" during that gap and
  // drops its icon for the frame the reader is still looking at it. Lagging
  // one commit behind — updated in an effect, after paint — keeps every link
  // on the outgoing page reading the outgoing location until it actually
  // leaves with it.
  //
  // The dependency list matters: without one this effect runs after EVERY
  // render of EVERY link, and a doc page carries hundreds of them.
  const shownPath = useRef(location.pathname);
  useEffect(() => {
    shownPath.current = location.pathname;
  }, [location.pathname]);
  // Which visual line the pointer entered on, for wrapped multi-line links —
  // null on keyboard focus, where there is no cursor position to anchor to.
  const hoverPosRef = useRef<{ x: number; y: number } | null>(null);

  const external = /^[a-z]+:/i.test(href);
  // The help's own links to other pages are written `#/nodes/sop/box`: the
  // markdown has to work in a plain viewer, where the app's route is a hash.
  // Read as written, that `#` says "a place on this page", and the link goes
  // nowhere, says "Already on this page", and has no page to name in a
  // tooltip. The leading hash belongs to the route, so it comes off here.
  const to = href.startsWith("#/") ? href.slice(1) : href;
  const hashAt = to.indexOf("#");
  const anchor = hashAt >= 0 ? to.slice(hashAt + 1) : null;
  // The tooltip names a page, so it needs the page and not the heading in it.
  // A link that is only an anchor has no page of its own: it means this page.
  const path = hashAt >= 0 ? to.slice(0, hashAt) : to;
  const anchorOnly = hashAt >= 0 && path === "";
  const slug = external ? null : path.replace(/^\/+/, "");
  // A link to the home page has an empty slug too — same as an anchor-only
  // link — but it is a real page, not "this page", so it needs its own
  // pathname check rather than falling into the anchor-only case.
  const samePage = !external && (anchorOnly || shownPath.current === `/${slug}`);

  /* Every link to a page in the help wears that page's icon. A name with its
     glyph in front of it is recognised before it is read, and the icon is the
     same one the panel and the search draw for that page. The answer arrives
     with the batch the tooltips already ask for, so a link costs no call of
     its own. */
  const marked = mark && !external && !!slug && !samePage;
  const meta = usePageMark(marked ? slug : null);
  const glyph = marked ? (
    meta?.icon ? (
      <DocIconClient
        src={meta.icon}
        alt=""
        className="doc-icon mr-0.75 ml-0.5"
        // The install ships a few pages with no icon file. A page with no
        // glyph beside a page with one reads as a fault, so it gets the plain
        // page mark.
        fallback={<Icons.page className="mr-0.75 ml-0.5 inline size-[1em] align-[-0.15em]" />}
      />
    ) : (
      <Icons.page className="mr-0.75 ml-0.5 inline size-[1em] align-[-0.15em]" />
    )
  ) : null;

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
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
      >
        {children}
      </a>
    );
  }

  return (
    <span className={cn("relative", fullWidth ? "block w-full" : "inline")}>
      <Link
        ref={linkRef}
        to={to}
        className={cn(classes, "cursor-interactive")}
        onClick={(e) => {
          // A link to the page already open is not a navigation. The anchor
          // cases settle here, and the click never reaches the router.
          if (!samePage) return;
          e.preventDefault();
          if (!anchor) {
            showToast("Already on this page");
            return;
          }
          const target = document.getElementById(decodeURIComponent(anchor));
          if (target) target.scrollIntoView({ behavior: "smooth" });
          else showToast(`This page has no section named "${anchor}"`, "error");
        }}
        // Start reading the page the pointer is travelling towards. Every
        // other link in the app does this — the sidebar rows, the library, the
        // bookmarks — and a doc link that did not was the one link in the
        // window that always opened cold. See `warm` in lib/pages.
        onPointerEnter={() => {
          if (!samePage && slug) warm(slug);
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
        {glyph}
        {children}
      </Link>
      {visible && slug && (
        <DocTooltip
          slug={slug}
          anchorRef={linkRef}
          hoverPosRef={hoverPosRef}
        />
      )}
    </span>
  );
}
