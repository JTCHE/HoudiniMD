// Decides whether a /docs/ request gets raw markdown (.md) or rendered HTML.
// Default is markdown: an unidentified fetcher is far more likely an agent than
// a browser, and llms.txt consumers must not have to opt in.

// Real browsers send Mozilla/5.0 plus a known engine token.
const BROWSER_RE = /Mozilla\/5\.0.+\b(Chrome|Firefox|Safari|Edg|OPR|Vivaldi)\b/;

// iOS in-app browsers (X, Facebook, Instagram, LinkedIn, Slack, Reddit, Mail…)
// are WKWebViews that drop the Version/ and Safari/ tokens, so BROWSER_RE alone
// misses them. They all keep the iOS build token — "Mobile/22F76" — which no
// programmatic fetcher or AI crawler sends.
const IOS_WEBVIEW_RE = /\bMobile\/\w+/;

// Search-engine and social-preview crawlers we WANT to receive the rendered
// HTML (and index it / build link previews). These are NOT redirected to .md.
// AI training/answer bots (GPTBot, ClaudeBot, …) are deliberately absent —
// they're disallowed from /docs/ HTML in robots.ts and steered to .md.
const HTML_CRAWLER_SRC =
  'Googlebot|Storebot-Google|Google-InspectionTool|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Applebot|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|Slackbot';
const HTML_CRAWLER_RE = new RegExp(`\\b(${HTML_CRAWLER_SRC})\\b`, 'i');

// SEO and archive crawlers: they index like a search engine but nothing we
// publish for them is read by a person, so they get the cheap .md — while
// still counting as crawlers, not agents, on the dashboard.
const SEO_CRAWLER_SRC = 'SemrushBot|AhrefsBot|MJ12bot|DotBot|BLEXBot|DataForSeoBot|PetalBot|Sogou|Seekport|ia_archiver|archive\\.org_bot';

const CRAWLER_RE = new RegExp(`\\b(${HTML_CRAWLER_SRC}|${SEO_CRAWLER_SRC})\\b`, 'i');

// Bots that fetch content for an LLM. Several send a complete Chrome UA with
// their own token appended (meta-externalagent does), so this must be tested
// BEFORE any browser-shaped check or they are counted as readers.
const AGENT_SRC =
  'GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-Web|Claude-SearchBot|anthropic-ai|Google-Extended|GoogleOther|CCBot|PerplexityBot|Perplexity-User|Amazonbot|Bytespider|cohere-ai|Meta-ExternalAgent|meta-externalfetcher|Applebot-Extended|DuckAssistBot|YouBot|Diffbot|Timpibot|Firecrawl';
const AGENT_RE = new RegExp(`\\b(${AGENT_SRC})\\b`, 'i');

/** Just the part of `Headers` this module reads. */
export interface HeaderBag {
  get(name: string): string | null;
}

/**
 * Headers a real browser navigation carries and a scraper wearing a copied
 * Chrome UA usually does not. A user-agent string is free to write; these have
 * to be produced by an actual engine.
 *
 * Recorded per view so the dashboard can say how much evidence a "human" had,
 * and so this rule can be tightened later against real traffic rather than a
 * guess. `-` means "measured, found nothing", which is not the same as an
 * archived row from before we measured at all.
 */
const BROWSER_HEADERS = {
  d: 'sec-fetch-dest', // Chrome 76+, Firefox 90+, Safari 16.4+
  m: 'sec-fetch-mode',
  l: 'accept-language', // every browser ever, and few HTTP clients
  c: 'sec-ch-ua', // Chromium only
} as const;

export const NO_EVIDENCE = '-';

export function browserEvidence(headers: HeaderBag): string {
  const seen = Object.entries(BROWSER_HEADERS)
    .filter(([, header]) => headers.get(header))
    .map(([mark]) => mark)
    .join('');
  return seen || NO_EVIDENCE;
}

/**
 * True for programmatic / AI fetchers: not a browser and not a known HTML
 * crawler (curl, python-requests, GPTBot, ClaudeBot, …).
 */
export function wantsMarkdown(
  ua: string | null,
  headers?: HeaderBag | null
): boolean {
  if (visitorKind(ua, headers) === 'human') return false;
  // Everything non-human gets markdown except the crawlers whose whole job is
  // to index the page a person will see.
  return !(ua && HTML_CRAWLER_RE.test(ua));
}

// Name a crawler/agent for the live feed — "Googlebot" reads better than
// "crawler". Not exhaustive; the union of the two lists visitorKind uses.
const BOT_FAMILY_RE = new RegExp(`\\b(${HTML_CRAWLER_SRC}|${SEO_CRAWLER_SRC}|${AGENT_SRC})\\b`, 'i');

export function botFamily(ua: string | null): string | null {
  return ua?.match(BOT_FAMILY_RE)?.[1] ?? null;
}

export type VisitorKind = 'human' | 'crawler' | 'agent';

/**
 * Who is asking. Analytics needs the three-way split (a Googlebot hit is not a
 * reader), the redirect only needs to know whether it is a human.
 *
 * A bot that names itself is taken at its word first: both the browser check
 * and `Sec-Fetch-Dest` are forgeable, and several bots forge them. Only an
 * unnamed visitor is judged on the shape of its UA — so a new crawler still
 * lands in 'agent' rather than 'human', and passing a bare family name (the
 * `bot` column of an archived row) through here re-derives its kind.
 *
 * A browser-shaped UA that arrives with NONE of the four headers a browser
 * always sends is a copied string, not a browser. That is a deliberately weak
 * test — any one header is enough to pass — because the cost of demoting a
 * real reader (markdown instead of the rendered page) is far worse than the
 * cost of counting one more scraper as human. With no headers to look at at
 * all, the UA is taken at face value, as before.
 */
export function visitorKind(
  ua: string | null,
  headers?: HeaderBag | null
): VisitorKind {
  if (ua && CRAWLER_RE.test(ua)) return 'crawler';
  if (ua && AGENT_RE.test(ua)) return 'agent';
  // A top-level navigation is the strongest browser signal there is: no HTTP
  // client library sends it, so it beats even a missing user-agent.
  if (headers?.get('sec-fetch-dest') === 'document') return 'human';
  if (!ua) return 'agent';
  if (!BROWSER_RE.test(ua) && !IOS_WEBVIEW_RE.test(ua)) return 'agent';
  return !headers || browserEvidence(headers) !== NO_EVIDENCE ? 'human' : 'agent';
}
