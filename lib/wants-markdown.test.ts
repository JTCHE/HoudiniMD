/**
 * visitorKind now decides two things at once: which format /docs/* serves, and
 * which bucket a request lands in on the analytics dashboard. A regression here
 * shows up as "nobody visits the site" rather than as an error.
 *
 *   bun test lib/wants-markdown.test.ts
 */
import { expect, test } from "bun:test";
import { botFamily, visitorKind, wantsMarkdown } from "./wants-markdown";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IOS_WEBVIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS] Mobile/22F76";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

test("classifies each visitor type", () => {
  expect(visitorKind(CHROME)).toBe("human");
  expect(visitorKind(IOS_WEBVIEW)).toBe("human");
  expect(visitorKind(null, "document")).toBe("human"); // Sec-Fetch-Dest beats a missing UA
  expect(visitorKind(GOOGLEBOT)).toBe("crawler");
  expect(visitorKind("ClaudeBot/1.0")).toBe("agent");
  expect(visitorKind("curl/8.5.0")).toBe("agent");
  expect(visitorKind(null)).toBe("agent");
});

test("wantsMarkdown redirects agents only", () => {
  expect(wantsMarkdown("python-requests/2.32")).toBe(true);
  expect(wantsMarkdown(null)).toBe(true);
  expect(wantsMarkdown(CHROME)).toBe(false);
  expect(wantsMarkdown(GOOGLEBOT)).toBe(false);
  expect(wantsMarkdown("curl/8.5.0", "document")).toBe(false);
});

test("botFamily names known crawlers/agents, else null", () => {
  expect(botFamily(GOOGLEBOT)).toBe("Googlebot");
  expect(botFamily("ClaudeBot/1.0")).toBe("ClaudeBot");
  expect(botFamily("Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)")).toBe("GPTBot");
  expect(botFamily(CHROME)).toBeNull();
  expect(botFamily(null)).toBeNull();
});
