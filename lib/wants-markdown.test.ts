/**
 * visitorKind now decides two things at once: which format /docs/* serves, and
 * which bucket a request lands in on the analytics dashboard. A regression here
 * shows up as "nobody visits the site" rather than as an error.
 *
 *   bun test lib/wants-markdown.test.ts
 */
import { expect, test } from "bun:test";
import { botFamily, browserEvidence, visitorKind, wantsMarkdown } from "./wants-markdown";

/** A stand-in for `request.headers`. */
const hdrs = (h: Record<string, string>) => new Headers(h);
/** What a real Chrome navigation carries alongside its user-agent. */
const CHROME_HEADERS = hdrs({
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "accept-language": "en-GB,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="130"',
});

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IOS_WEBVIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS] Mobile/22F76";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
// Neither of these is browser-shaped enough to be a reader, and both used to be
// counted as one: Semrush carries the Mozilla prefix, Meta appends its token to
// a complete Chrome UA and sends Sec-Fetch-Dest with it.
const SEMRUSH = "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)";
const META =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 (compatible; meta-externalagent/1.1; +https://developers.facebook.com/docs/sharing/webmasters/crawler)";

test("classifies each visitor type", () => {
  expect(visitorKind(CHROME)).toBe("human");
  expect(visitorKind(IOS_WEBVIEW)).toBe("human");
  expect(visitorKind(null, CHROME_HEADERS)).toBe("human"); // Sec-Fetch-Dest beats a missing UA
  expect(visitorKind(GOOGLEBOT)).toBe("crawler");
  expect(visitorKind("ClaudeBot/1.0")).toBe("agent");
  expect(visitorKind("curl/8.5.0")).toBe("agent");
  expect(visitorKind(null)).toBe("agent");
});

test("a self-named bot is never a reader, whatever else it claims", () => {
  expect(visitorKind(SEMRUSH)).toBe("crawler");
  expect(visitorKind(SEMRUSH, CHROME_HEADERS)).toBe("crawler");
  expect(visitorKind(META)).toBe("agent");
  expect(visitorKind(META, CHROME_HEADERS)).toBe("agent");
});

test("a copied Chrome UA with no browser headers is not a reader", () => {
  expect(visitorKind(CHROME, hdrs({}))).toBe("agent");
  expect(visitorKind(CHROME, hdrs({ accept: "*/*" }))).toBe("agent");
  // Deliberately weak: any one of the four headers is enough to pass, so a
  // real reader is never demoted over a missing Sec-CH-UA or a stripped
  // Accept-Language.
  expect(visitorKind(CHROME, hdrs({ "accept-language": "fr" }))).toBe("human");
  expect(visitorKind(CHROME, hdrs({ "sec-fetch-mode": "navigate" }))).toBe("human");
  expect(visitorKind(CHROME, CHROME_HEADERS)).toBe("human");
  expect(visitorKind(CHROME)).toBe("human"); // no headers to judge: trust the UA
  expect(wantsMarkdown(CHROME, hdrs({}))).toBe(true);
});

test("browserEvidence records which signals were actually present", () => {
  expect(browserEvidence(CHROME_HEADERS)).toBe("dmlc");
  expect(browserEvidence(hdrs({ "accept-language": "fr" }))).toBe("l");
  // Not the empty string: an archived row that predates the measurement must
  // stay distinguishable from one measured and found bare.
  expect(browserEvidence(hdrs({}))).toBe("-");
});

test("a bare family name re-derives its kind, for archived rows", () => {
  expect(visitorKind("SemrushBot")).toBe("crawler");
  expect(visitorKind("meta-externalagent")).toBe("agent");
  expect(visitorKind("Googlebot")).toBe("crawler");
});

test("wantsMarkdown serves HTML to humans and indexing crawlers only", () => {
  expect(wantsMarkdown("python-requests/2.32")).toBe(true);
  expect(wantsMarkdown(null)).toBe(true);
  expect(wantsMarkdown(SEMRUSH)).toBe(true); // a crawler, but nobody reads its copy
  expect(wantsMarkdown(CHROME)).toBe(false);
  expect(wantsMarkdown(GOOGLEBOT)).toBe(false);
  expect(wantsMarkdown("curl/8.5.0", CHROME_HEADERS)).toBe(false);
});

test("botFamily names known crawlers/agents, else null", () => {
  expect(botFamily(GOOGLEBOT)).toBe("Googlebot");
  expect(botFamily("ClaudeBot/1.0")).toBe("ClaudeBot");
  expect(botFamily("Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)")).toBe("GPTBot");
  expect(botFamily(SEMRUSH)).toBe("SemrushBot");
  expect(botFamily(META)).toBe("meta-externalagent");
  expect(botFamily(CHROME)).toBeNull();
  expect(botFamily(null)).toBeNull();
});
