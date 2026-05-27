import type { MetadataRoute } from "next";

// Strategy:
//   * Default (Googlebot, Bingbot, etc.) — allow everything. We WANT HTML pages
//     indexed for SEO; the rendered article carries the same content as the .md.
//     HTML pages also advertise their markdown twin via
//       <link rel="alternate" type="text/markdown" href=".../slug.md">
//     (see app/docs/[...slug]/page.tsx generateMetadata), which is the polite
//     way to steer agents that respect content negotiation.
//
//   * AI training / answer bots — restrict to /docs/*.md only. Same content,
//     cleaner tokens, no chrome. This is the whole reason the site exists.
//
// Note: when a UA matches a specific block, it uses ONLY that block and ignores
// the `*` block, so the explicit AI rules below override the permissive default.
const aiBotDocRules = {
  disallow: "/docs/",
  allow: "/docs/*.md",
} as const;

// Bots that train LLMs, ground LLM answers, or otherwise ingest content
// programmatically. Keep search-only crawlers (Googlebot, Bingbot, …) OUT of
// this list so they continue to index HTML for SEO.
const AI_BOTS = [
  // OpenAI
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Anthropic
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  // Google AI (separate from Googlebot — these control Gemini training/grounding)
  "Google-Extended",
  "GoogleOther",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Apple Intelligence
  "Applebot-Extended",
  // Others
  "CCBot",
  "cohere-ai",
  "Meta-ExternalAgent",
  "Bytespider",
  "Amazonbot",
  "DuckAssistBot",
  "YouBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Permissive default — search engines crawl everything.
      { userAgent: "*", allow: "/" },
      // AI bots — markdown only.
      ...AI_BOTS.map((userAgent) => ({ userAgent, ...aiBotDocRules })),
    ],
    sitemap: `${process.env.URL}/sitemap.xml`,
    host: process.env.URL,
  };
}
