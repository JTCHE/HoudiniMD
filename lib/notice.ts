/**
 * What this reader already did with the notice, kept for the next visit.
 *
 * `dismissed` holds the KIND that was closed, not a flag, so a reader who
 * closed the waitlist still gets the release notice one time.
 */
export const NOTICE_STATE_KEY = "houdinimd:notice";

/**
 * Runs in the document head, before the first paint. A notice this reader
 * closed, or one they already signed, is hidden by CSS before it can draw, so
 * hiding it costs no jump.
 *
 * The kind comes off the `html` tag, which `worker.ts` stamps as the response
 * streams out, so this file never has to know which notice is live.
 */
export const NOTICE_HEAD_SCRIPT =
  `try{var d=document.documentElement,k=d.dataset.noticeKind,` +
  `s=JSON.parse(localStorage.getItem('${NOTICE_STATE_KEY}')||'{}');` +
  `if(s.signed&&k==='waitlist')d.dataset.notice='off';` +
  `else if(k&&s.dismissed===k)d.dataset.notice='dismissed'}catch(e){}`;
