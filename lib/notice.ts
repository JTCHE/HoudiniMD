/**
 * The wind-down notice copy.
 *
 * It sits in code, not in a static file, so every page carries the words in
 * its own prerendered HTML. Nothing is fetched and nothing appears late, which
 * is the only way the notice cannot move the page under the reader.
 *
 * The price is the deploy: an edit here renames the client chunk, so the next
 * deploy rewrites the incremental cache, about 11.5k R2 class A writes. That
 * is one edit at the announcement, and it is accepted.
 */

/** Which notice the site shows. Change at the announcement, and deploy. */
export const NOTICE_KIND: "waitlist" | "download" = "waitlist";

export const NOTICE = {
  waitlist: {
    title: "HoudiniMD is becoming a free, offline app.",
    body: "Get one email when it is out. This site will close on Jan 1st, 2027.",
    linkLabel: "Learn More",
    linkHref: "https://github.com/JTCHE/HoudiniMD",
    placeholder: "you@studio.com",
    submitLabel: "Notify me",
    signedLabel: "You are on the list. One email at release.",
  },
  download: {
    title: "HoudiniMD is now a free, offline & open-source app.",
    body: "A blazing fast interface combined with smart search features. This site will close on Jan 1st, 2027.",
    linkLabel: "Learn More",
    linkHref: "https://github.com/JTCHE/HoudiniMD",
    ctaLabel: "Download for Windows",
    ctaHref: "/download",
    /** The app runs on Windows only. Every other reader gets the source. */
    altLabel: "View on GitHub",
    altHref: "https://github.com/JTCHE/HoudiniMD",
  },
} as const;

/**
 * What this reader already did, kept for the next visit.
 *
 * `dismissed` holds the KIND that was closed, not a flag, so a reader who
 * closed the waitlist still gets the release notice one time.
 */
export const NOTICE_STATE_KEY = "houdinimd:notice";

/**
 * Runs in the document head, before the first paint. A notice this reader
 * closed, or one they already signed, is hidden by CSS before it can draw, so
 * hiding it costs no jump. React still renders the card, which keeps the
 * hydrated tree equal to the prerendered HTML.
 */
export const NOTICE_HEAD_SCRIPT =
  `try{var s=JSON.parse(localStorage.getItem('${NOTICE_STATE_KEY}')||'{}');` +
  `if(s.signed&&'${NOTICE_KIND}'==='waitlist')document.documentElement.dataset.notice='off';` +
  `else if(s.dismissed==='${NOTICE_KIND}')document.documentElement.dataset.notice='dismissed'}catch(e){}`;
