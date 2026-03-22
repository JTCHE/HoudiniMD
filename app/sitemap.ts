import type { MetadataRoute } from "next";
import { fetchIndexJson } from "@/lib/r2/read";
import type { SearchIndexEntry } from "@/lib/r2/search-index";

export const revalidate = 3600;

const BASE_URL = process.env.URL ?? "https://houdinimd.jchd.me";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
  ];

  try {
    const raw = await fetchIndexJson();
    if (!raw) return base;
    const entries: SearchIndexEntry[] = JSON.parse(raw);
    return [
      ...base,
      ...entries.map((e) => ({
        url: `${BASE_URL}/docs/${e.path}`,
        lastModified: e.lastModified ? new Date(e.lastModified) : new Date("2026-01-01"),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return base;
  }
}
