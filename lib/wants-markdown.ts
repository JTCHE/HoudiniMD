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
  // Only on a navigation the user activated: a click, a bookmark, the address
  // bar. An automated page.goto() never carries it. Absent on reload, on
  // back/forward, on a scripted location change and on every prefetch, so it
  // can only ever ADD evidence — this map is an OR, and requiring `u` would
  // demote a reader who pressed F5 and redirect them to markdown.
  u: 'sec-fetch-user',
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
 * Where the browser says the request came from — 'none' (address bar, bookmark),
 * 'same-origin', 'same-site' or 'cross-site'. Every browser that sends any
 * `sec-fetch-*` sends this one, on every request, and a script cannot override
 * it: it is computed from the real initiator, not from anything a fetcher sets.
 *
 * That is what makes it worth storing beside `referrer`. A `Referer` naming our
 * own origin next to `sec-fetch-site: none` is a combination a browser cannot
 * produce — it means the Referer was written by hand. Stored, not judged here:
 * the dashboard decides what to do with the contradiction, so nothing about
 * this can change what a reader is served.
 *
 * '' means the client sent no `sec-fetch-site` at all (a browser older than
 * Chrome 76 / Firefox 90 / Safari 16.4, or not a browser). Silence is not
 * evidence, and every rule reading this column must skip the row.
 */
export const fetchSite = (headers: HeaderBag): string => headers.get('sec-fetch-site') ?? '';

/**
 * The primary language tag, lowercased — "en-us,en;q=0.9" is "en-us".
 *
 * Recorded for the language rollup, and NOT used to classify anyone. A reader
 * in France with an English desktop is completely ordinary, so this header
 * disagreeing with `cf-ipcountry` says nothing about one visitor. It is only
 * worth reading across many: one identical tag shared by a few hundred first-
 * seen visitors in sixty countries in one hour is a proxy pool, and that is a
 * question to ask of a burst, never of a row.
 */
export const primaryLanguage = (headers: HeaderBag): string =>
  (headers.get('accept-language') ?? '').split(',')[0]!.split(';')[0]!.trim().toLowerCase().slice(0, 12);

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

export type VisitorKind = 'human' | 'crawler' | 'agent' | 'bot';

/**
 * Who is asking. Analytics needs the split (a Googlebot hit is not a reader),
 * the redirect only needs to know whether it is a human.
 *
 * A bot that names itself is taken at its word first: both the browser check
 * and `Sec-Fetch-Dest` are forgeable, and several bots forge them. Passing a
 * bare family name (the `bot` column of an archived row) through here
 * re-derives its kind.
 *
 * Three of the four kinds are claims the visitor made about itself. 'bot' is
 * the absence of one: no name we know, no browser we can corroborate. It is
 * not 'agent', which means a named LLM fetcher and is drawn as the loudest
 * thing on the dashboard — an unidentified client is the quietest.
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
  if (!ua) return 'bot';
  if (!BROWSER_RE.test(ua) && !IOS_WEBVIEW_RE.test(ua)) return 'bot';
  return !headers || browserEvidence(headers) !== NO_EVIDENCE ? 'human' : 'bot';
}

export type BrowserKind = 'chrome' | 'firefox' | 'safari' | 'edge' | 'opera' | 'vivaldi' | 'samsung' | 'in-app' | 'unknown';

/** Browser family for the Browsers rollup. More specific Chromium brands must win before Chrome. */
export function browserKind(ua: string | null, headers?: HeaderBag | null): BrowserKind {
  if (!ua || visitorKind(ua, headers) !== 'human') return 'unknown';
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return 'edge';
  if (/\b(?:OPR|OPiOS)\//.test(ua)) return 'opera';
  if (/\bVivaldi\//.test(ua)) return 'vivaldi';
  if (/\bSamsungBrowser\//.test(ua)) return 'samsung';
  if (/\b(?:Firefox|FxiOS)\//.test(ua)) return 'firefox';
  if (/\b(?:Chrome|CriOS|Chromium)\//.test(ua)) return 'chrome';
  if (/\bSafari\//.test(ua)) return 'safari';
  if (IOS_WEBVIEW_RE.test(ua)) return 'in-app';
  return 'unknown';
}

export type DeviceKind = 'mobile' | 'desktop';

// A phone or a small touch UA names itself in one of these tokens. Checked
// against DeviceAtlas's UA sample set (deviceatlas.com/blog/list-of-user-agent-strings)
// across phones, tablets, desktop OSes, TVs, consoles and bots: every phone,
// Android tablet and iPad in the set matches, every plain desktop browser
// does not. Two false positives surfaced there, both accepted: a Fire TV and
// an old Xbox One, which spoof "Android"/"Windows Phone" in their platform
// string — living-room devices this docs site does not expect traffic from.
// iPadOS 13+ is the deliberate gap in the other direction: Safari's default
// UA on iPad is a plain Macintosh string with no token here and no
// `sec-ch-ua-mobile` (Chromium-only), so a real iPad browsing in Safari reads
// as desktop. That is the same gap every UA-based device split has; it is not
// worth a client-side beacon to close for one device family.
const MOBILE_UA_RE = /\b(Mobile|Android|iPhone|iPod|IEMobile|Windows Phone|BlackBerry|Opera Mini)\b/;

/**
 * Mobile vs desktop, for the Devices rollup. Chromium sends `Sec-CH-UA-Mobile`
 * on every request and it survives a UA override where the UA string itself
 * would not, so it is checked first; Safari and Firefox never send it and fall
 * back to the UA token.
 */
export function deviceKind(ua: string | null, headers?: HeaderBag | null): DeviceKind {
  const chMobile = headers?.get('sec-ch-ua-mobile');
  if (chMobile === '?1') return 'mobile';
  if (chMobile === '?0') return 'desktop';
  return ua && MOBILE_UA_RE.test(ua) ? 'mobile' : 'desktop';
}
