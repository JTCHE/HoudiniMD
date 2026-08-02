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
const HTML_CRAWLER_RE =
  /\b(Googlebot|Storebot-Google|Google-InspectionTool|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Applebot|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|Slackbot)\b/i;

/**
 * True for programmatic / AI fetchers: not a browser and not a known HTML
 * crawler (curl, python-requests, GPTBot, ClaudeBot, …).
 *
 * `secFetchDest` is the `Sec-Fetch-Dest` header. Every browser since Chrome 76 /
 * Firefox 90 / Safari 16.4 sends `document` on a top-level navigation, and no
 * HTTP client library sends it at all — it is a stronger browser signal than any
 * user-agent string, so it wins outright.
 */
export function wantsMarkdown(
  ua: string | null,
  secFetchDest?: string | null
): boolean {
  return visitorKind(ua, secFetchDest) === 'agent';
}

// Name a crawler/agent for the live feed — "Googlebot" reads better than
// "crawler". Not exhaustive, and unlike HTML_CRAWLER_RE this is analytics
// labelling only: it never changes what visitorKind()/wantsMarkdown() decide.
const BOT_FAMILY_RE =
  /\b(Googlebot|Storebot-Google|Google-InspectionTool|Google-Extended|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Applebot|facebookexternalhit|Twitterbot|LinkedInBot|Discordbot|Slackbot|GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-Web|anthropic-ai|CCBot|PerplexityBot|Perplexity-User|Amazonbot|Bytespider|cohere-ai|Meta-ExternalAgent|Diffbot|SemrushBot|AhrefsBot|MJ12bot)\b/i;

export function botFamily(ua: string | null): string | null {
  return ua?.match(BOT_FAMILY_RE)?.[1] ?? null;
}

export type VisitorKind = 'human' | 'crawler' | 'agent';

/**
 * Who is asking, using the same signals as `wantsMarkdown` above. Analytics
 * needs the three-way split (a Googlebot hit is not a reader), the redirect
 * only needs to know whether it is an agent.
 */
export function visitorKind(
  ua: string | null,
  secFetchDest?: string | null
): VisitorKind {
  if (ua && HTML_CRAWLER_RE.test(ua)) return 'crawler';
  if (secFetchDest === 'document') return 'human';
  if (!ua) return 'agent';
  return BROWSER_RE.test(ua) || IOS_WEBVIEW_RE.test(ua) ? 'human' : 'agent';
}
