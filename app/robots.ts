import type { MetadataRoute } from "next";

// HTML doc pages are intended for humans. Crawlers should use the .md equivalents
// (same URL + .md suffix), which serve raw markdown directly.
const docRules = {
  disallow: "/docs/",
  allow: "/docs/*.md",
} as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        ...docRules,
      },
      {
        userAgent: "GPTBot",
        ...docRules,
      },
      {
        userAgent: "ChatGPT-User",
        ...docRules,
      },
      {
        userAgent: "Claude-Web",
        ...docRules,
      },
      {
        userAgent: "PerplexityBot",
        ...docRules,
      },
      {
        userAgent: "anthropic-ai",
        ...docRules,
      },
      {
        userAgent: "Applebot-Extended",
        ...docRules,
      },
      {
        userAgent: "GoogleOther",
        ...docRules,
      },
      {
        userAgent: "CCBot",
        ...docRules,
      },
      {
        userAgent: "cohere-ai",
        ...docRules,
      },
    ],
    sitemap: `${process.env.URL}/sitemap.xml`,
    host: process.env.URL,
  };
}
