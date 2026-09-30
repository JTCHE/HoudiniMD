import { SITE_URL } from "@/lib/site";
import type { MetadataRoute } from "next";

// Everything stays open to crawlers: a doc address has to be fetched for its
// 410 and `noindex` to take it out of an index.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
