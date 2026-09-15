/**
 * The notice copy, and the only file to edit when it changes.
 *
 * It is read by `worker.ts`, never by a page. The Worker writes the words into
 * the HTML as the response streams out, so every reader gets finished HTML and
 * no page waits for a request. The client bundle carries none of this: see
 * `lib/notice-rewrite.ts` for how the words reach a client-side navigation.
 *
 * WHY IT SITS HERE AND NOT IN THE COMPONENT.
 *
 * Every doc page's HTML is an object in the R2 incremental cache, about 21k of
 * them, and a page names its client chunks by content hash. Copy written in
 * the component therefore lands in a chunk whose name every page carries, and
 * changing one word rewrites the whole cache: about 11.5k class A writes and a
 * slow deploy. Nothing here is in a chunk and nothing here is in a cached
 * page, so an edit costs one Worker script and no cache object at all.
 *
 * Bump NOTICE_VERSION with any edit below. It is part of the edge cache key,
 * so the entries holding the previous wording are never read again.
 */

export const NOTICE_VERSION = "1";

/** Which notice the site shows. One word, and a deploy. */
export const NOTICE_KIND: NoticeKind = "waitlist";

export type NoticeKind = "waitlist" | "download";

export interface NoticeCopy {
  title: string;
  body: string;
  linkLabel: string;
  linkHref: string;
  /** The waitlist form. */
  placeholder: string;
  submitLabel: string;
  signedLabel: string;
  /** The download key. A reader who is not on Windows gets the `alt` pair. */
  ctaLabel: string;
  ctaHref: string;
  altLabel: string;
  altHref: string;
}

const WAITLIST: NoticeCopy = {
  title: "HoudiniMD is becoming a free, offline app.",
  body: "Get one email when it is out. This site will close on Jan 1st, 2027.",
  linkLabel: "Learn More",
  linkHref: "https://github.com/JTCHE/HoudiniMD",
  placeholder: "you@studio.com",
  submitLabel: "Notify me",
  signedLabel: "You are on the list. One email at release.",
  ctaLabel: "Download for Windows",
  ctaHref: "/download",
  altLabel: "View on GitHub",
  altHref: "https://github.com/JTCHE/HoudiniMD",
};

const DOWNLOAD: NoticeCopy = {
  ...WAITLIST,
  title: "HoudiniMD is now a free, offline & open-source app.",
  body: "A blazing fast interface combined with smart search features. This site will close on Jan 1st, 2027.",
};

export const NOTICE_COPY: NoticeCopy = NOTICE_KIND === "waitlist" ? WAITLIST : DOWNLOAD;
