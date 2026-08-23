import { SITE_HOST } from "./site";

// /api/generate makes the Worker scrape sidefx.com, so an open route is both a
// scrape proxy and a CPU-billing hole. Two callers are legitimate:
//
//   * the browser — GeneratingPage, Tooltip and mirror-page open an EventSource.
//     EventSource cannot set headers, so these are recognised by the same-origin
//     fetch metadata the browser sets itself and a page cannot forge.
//   * the server-side kickoff in app/docs/[...slug]/page.tsx, a bare fetch()
//     that sends no such metadata. It carries the shared secret instead.
//
// Anything else gets 403.

export const KICKOFF_HEADER = "x-houdinimd-kickoff";

/** Shared secret for the server-side kickoff. Set with `wrangler secret put`. */
export function kickoffSecret(): string {
  const secret = process.env.GENERATE_KICKOFF_SECRET;
  if (!secret) {
    throw new Error(
      "GENERATE_KICKOFF_SECRET is not set. Set it in .env.local for local builds and " +
        "with `wrangler secret put GENERATE_KICKOFF_SECRET` for the Worker.",
    );
  }
  return secret;
}

function isSameOriginBrowserRequest(headers: Headers): boolean {
  // Sec-Fetch-Site is set by the browser and is unforgeable from page script.
  if (headers.get("sec-fetch-site") !== "same-origin") return false;

  // Origin is absent on EventSource, present on fetch(). Check it when sent.
  const origin = headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === SITE_HOST;
  } catch {
    return false;
  }
}

function isInternalKickoff(headers: Headers): boolean {
  const sent = headers.get(KICKOFF_HEADER);
  if (sent === null) return false;

  // Constant-time compare so a wrong secret leaks no length or prefix.
  const expected = kickoffSecret();
  if (sent.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** True when this request may trigger generation. */
export function isAuthorizedGenerateRequest(headers: Headers): boolean {
  return isSameOriginBrowserRequest(headers) || isInternalKickoff(headers);
}
