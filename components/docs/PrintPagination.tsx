"use client";

import { useEffect } from "react";

const MM_TO_PX = 96 / 25.4;
// A4 in CSS px at 96dpi — must match `@page { size: A4 }` in globals.css.
const PAGE_HEIGHT_PX = 297 * MM_TO_PX;
// Must match --print-page-x in globals.css — used here as the vertical
// margin too, so pages read as consistently margined on every side.
const MARGIN_PX = 1.3 * 10 * MM_TO_PX;
// Sub-pixel rounding in each getBoundingClientRect() read compounds a little
// more with every page this walks past — by page 4-5 of a long doc it's
// enough (~15-20px) to make something that should just fit spill onto an
// otherwise-empty extra page instead. A small safety margin absorbs that
// drift; it costs a sliver of blank space per page, not a whole page.
const SAFETY_PX = 24;
const USABLE_HEIGHT_PX = PAGE_HEIGHT_PX - 2 * MARGIN_PX - SAFETY_PX;

// How many table rows / list items must accompany a heading for the page
// break to look intentional. Below this, the whole heading + block moves
// to the next page instead of starting with a token sliver of content.
const MIN_COMPANION_ITEMS = 2;

function isHeading(el: Element): boolean {
  return /^H[1-6]$/.test(el.tagName);
}

function docTop(el: Element): number {
  return el.getBoundingClientRect().top + window.scrollY;
}

// Height a heading's first `MIN_COMPANION_ITEMS` rows/items would take, so
// we know how much room the heading actually needs to not look orphaned.
// Returns null for headings not followed by a table/list — plain prose
// reflows fine across a page break on its own; forcing it down too would
// waste paper for no benefit.
function headingCompanionHeight(heading: Element): number | null {
  let height = 0;
  let found = false;
  let el = heading.nextElementSibling;

  while (el && !isHeading(el)) {
    const table = el.tagName === "TABLE" ? el : el.querySelector(":scope > table");
    if (table) {
      const rows = Array.from(table.querySelectorAll("tbody > tr")).slice(0, MIN_COMPANION_ITEMS);
      height += rows.length
        ? rows.reduce((sum, r) => sum + (r as HTMLElement).offsetHeight, 0)
        : (el as HTMLElement).offsetHeight;
      found = true;
      break;
    }
    if (el.tagName === "UL" || el.tagName === "OL") {
      const items = Array.from(el.children).slice(0, MIN_COMPANION_ITEMS);
      height += items.reduce((sum, li) => sum + (li as HTMLElement).offsetHeight, 0);
      found = true;
      break;
    }
    // Connector content (an intro sentence, a callout) between the heading
    // and the table/list it introduces — count it fully, keep looking.
    height += (el as HTMLElement).offsetHeight;
    el = el.nextElementSibling;
  }

  return found ? height : null;
}

// A same-tag spacer so it's valid to insert right before its target (a <tr>
// can only sit in a <tbody>, a <li> only in a <ul>/<ol>). Always forces its
// own break-before: even when the browser already broke naturally right
// after this point, a spacer with no break-before is still just a ~49px box
// the browser is free to slot into whatever room is left at the bottom of
// the PREVIOUS page instead of the top of the new one — which both eats the
// margin we're trying to add and leaves a stray near-empty row behind. Since
// we already know a break belongs here, forcing it onto the spacer costs
// nothing extra (the page count doesn't change) and guarantees the spacer,
// not the content, is what starts the new page.
function makeSpacer(matchTag: string): HTMLElement {
  const tag = matchTag === "TR" ? "tr" : matchTag === "LI" ? "li" : "div";
  const spacer = document.createElement(tag);
  spacer.dataset.printSpacer = "";
  spacer.setAttribute("aria-hidden", "true");
  Object.assign(spacer.style, {
    breakBefore: "page",
    height: `${MARGIN_PX}px`,
    margin: "0",
    padding: "0",
    border: "none",
    listStyle: "none",
  });
  if (tag === "tr") {
    const td = document.createElement("td");
    td.style.padding = "0";
    td.style.border = "none";
    td.colSpan = 100;
    spacer.appendChild(td);
  }
  return spacer;
}

function isAtomic(el: Element): boolean {
  // TR is deliberately excluded — CSS `break-inside: avoid` on tr (see
  // globals.css) already stops the browser from splitting a row natively,
  // so forcing it here too was redundant. Worse, a spacer forced in front
  // of a tr lands AFTER <thead>'s browser-native auto-repeat on the new
  // page (thead always repeats first, regardless of DOM insertion order),
  // producing a blank row wedged between the header and the first real row
  // instead of a margin above the header. Table top-margin is handled by
  // padding directly on thead th in globals.css instead.
  return isHeading(el) || el.tagName === "LI";
}

// Prints the current docs article: pushes any heading, table row, or list
// item that wouldn't get enough room on the current page down to the next
// one, with a real margin, and gives a real top margin to every OTHER page
// the browser breaks to on its own (a paragraph, image, code block, or
// callout running past a page edge) — rather than the browser's own choice,
// which (a) lets a heading start with just one row/item before jumping, and
// (b) leaves every page with no top margin at all.
//
// ponytail: approximates real pagination — only headings/rows/items are
// atomic (forced onto a fresh page if they don't fit; everything else is
// left to reflow naturally, which is what you want for prose). Every direct
// child of the article is still walked so a run of plain content doesn't
// leave "remaining" below drifting against a stale page-top — but a break
// landing mid-paragraph (inside one of those children, not between them)
// still gets no margin nudge. If a future need calls for exact accuracy
// there too, reach for Paged.js instead of extending this.
export function PrintPagination() {
  useEffect(() => {
    function clearSpacers() {
      document.querySelectorAll("[data-print-spacer]").forEach((el) => el.remove());
      document.documentElement.removeAttribute("data-print-measure");
    }

    function apply() {
      clearSpacers();
      const article = document.querySelector("article.prose");
      if (!article) return;

      // Force print-width layout for measurement (see globals.css) — some
      // browsers haven't applied @media print yet when beforeprint fires.
      document.documentElement.setAttribute("data-print-measure", "");
      // Force a synchronous style/layout flush before reading positions.
      void document.body.offsetHeight;

      // Every block-level tag, at ANY depth — not just direct children of
      // the article. A `:scope > *`-only pass missed content one level
      // deeper than that (e.g. a numbered-steps block wrapping its own
      // illustration image in a container div): the wrapper div was the
      // only checkpoint, so a tall image inside it could still blow past a
      // page boundary invisibly. Matching by tag instead of position means
      // no wrapper nesting can hide a block from pageOrigin tracking again.
      // Deliberately excludes inline tags (a, code, strong, span, …) — a
      // spacer forced before one of those mid-sentence would break the
      // inline flow it sits in.
      const units = Array.from(
        article.querySelectorAll("h2, h3, h4, h5, h6, tbody > tr, li, p, pre, blockquote, img, hr, table, ul, ol, dl, div"),
      );

      // Position of the top of the *current* real page. NOT tracked via
      // `docTop(unit) % USABLE_HEIGHT_PX` — that assumes every page break
      // (including ones we force) lands on an exact multiple of page height
      // from the document's absolute top, which is only true before the
      // first forced break. Once we force one at an arbitrary position, the
      // true page grid resets from there, not from a multiple of page
      // height — modulo math against document origin silently drifts wrong
      // for every unit after that. Tracking the actual last page-start
      // position instead keeps every subsequent "how much room is left"
      // check correct regardless of where earlier breaks landed.
      let pageOrigin = 0;

      for (const unit of units) {
        // Real DOM position — automatically reflects every spacer inserted
        // so far in this pass, no manual offset bookkeeping needed.
        const top = docTop(unit);

        // How many page heights the browser has broken through on its own
        // since pageOrigin was last anchored. Without this, "remaining"
        // below silently drifts against a stale page-top once more than one
        // page's worth of content flows between two units we force-check.
        const pagesElapsed = Math.floor((top - pageOrigin) / USABLE_HEIGHT_PX);
        if (pagesElapsed > 0) pageOrigin += pagesElapsed * USABLE_HEIGHT_PX;

        if (isAtomic(unit)) {
          const required = isHeading(unit) ? headingCompanionHeight(unit) : (unit as HTMLElement).offsetHeight;
          if (required != null && USABLE_HEIGHT_PX - (top - pageOrigin) < required) {
            unit.parentElement?.insertBefore(makeSpacer(unit.tagName), unit);
            // This unit now sits right after the spacer, at the top of a
            // fresh page — re-measure its real position to anchor the grid.
            pageOrigin = docTop(unit);
            continue;
          }
        }

        if (pagesElapsed > 0) {
          // This unit already sits on a page the browser broke to on its
          // own (it fit, so no forced break above) — @page's own margin is
          // 0 (see globals.css), so without a nudge here the page starts
          // flush against the physical edge instead of with a margin.
          // TR skips the spacer (see isAtomic) but still anchors pageOrigin
          // here so later units in a long table keep correct page tracking.
          if (unit.tagName !== "TR") {
            unit.parentElement?.insertBefore(makeSpacer(unit.tagName), unit);
          }
          pageOrigin = docTop(unit);
        }
      }

      // Footer sits outside article.prose (a flex-column sibling of the
      // article, per DocsPageContent), so it just flows wherever content
      // ends — landing mid-page instead of pinned to the last page's
      // bottom. Push it down to sit flush against the bottom margin of
      // whichever page (existing last page, or a fresh one if it doesn't
      // fit) it ends up on.
      const footer = document.querySelector("footer");
      if (footer) {
        const footerHeight = (footer as HTMLElement).offsetHeight;
        if (USABLE_HEIGHT_PX - (docTop(footer) - pageOrigin) < footerHeight) {
          footer.parentElement?.insertBefore(makeSpacer(footer.tagName), footer);
          pageOrigin = docTop(footer);
        }
        const push = USABLE_HEIGHT_PX - (docTop(footer) - pageOrigin) - footerHeight;
        if (push > 0) {
          const bottomSpacer = document.createElement("div");
          bottomSpacer.dataset.printSpacer = "";
          bottomSpacer.setAttribute("aria-hidden", "true");
          bottomSpacer.style.height = `${push}px`;
          footer.parentElement?.insertBefore(bottomSpacer, footer);
        }
      }
    }

    window.addEventListener("beforeprint", apply);
    window.addEventListener("afterprint", clearSpacers);
    return () => {
      window.removeEventListener("beforeprint", apply);
      window.removeEventListener("afterprint", clearSpacers);
      clearSpacers();
    };
  }, []);

  return null;
}
