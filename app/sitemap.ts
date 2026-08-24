import { SITE_URL as BASE_URL } from "@/lib/site";
import type { MetadataRoute } from "next";
import { fetchIndexEntries } from "@/lib/r2/read";
import { checkDocNamespace } from "@/lib/url/namespaces";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${BASE_URL}/docs`, changeFrequency: "monthly", priority: 0.8 },
  ];

  try {
    // fetchIndexEntries (not fetchIndexJson) so this shares the warm-isolate
    // parsed-index cache with other routes instead of re-parsing the full
    // ~2.9MB index every time — sitemap.xml is requested rarely enough that
    // it was almost always paying that parse cold, brushing the 10ms CPU
    // limit and silently falling back to just this homepage entry.
    const entries = await fetchIndexEntries();
    if (!entries) return base;
    return [
      ...base,
      // Old versions of the index still hold version-suffixed paths
      // (houdini20.5/...). Those now redirect, so advertising them only sends
      // crawlers on a hop. See lib/url/namespaces.ts.
      ...entries
        .filter((e) => checkDocNamespace(e.path).kind === "allowed")
        .map((e) => ({
          url: `${BASE_URL}/docs/${e.path}`,
          lastModified: e.lastModified ? new Date(e.lastModified) : new Date("2026-01-01"),
          changeFrequency: "monthly" as const,
          priority: 0.7,
        })),
    ];
  } catch (error) {
    console.error("sitemap: failed to build entries, falling back to homepage only", error);
    return base;
  }
}
