/**
 * Where the title/summary map for every mirrored page is kept.
 *
 * It used to be built per request from `content/index.json`, which is ~3 MB:
 * 544 CPU-ms on a cold isolate, and the edge cache is per colo, so a thin
 * worldwide traffic pattern paid it again in every colo. scripts/build-search-index.ts
 * writes it once per deploy instead, and lib/stored-answer.ts streams the object.
 */
export const META_ALL_KEY = "content/meta-all.json";

export const META_ALL_PATH = "/api/meta-all";
