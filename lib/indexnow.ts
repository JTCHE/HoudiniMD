/**
 * IndexNow — https://www.indexnow.org
 *
 * A single push to the shared endpoint fans out to every participating
 * search engine (Bing, Yandex, Seznam.cz, Naver, …).
 *
 * Ownership of the host is proven by serving the key verbatim at
 * https://<host>/<INDEXNOW_KEY>.txt — see public/<key>.txt, which must be
 * kept in sync with the key below.
 */

export const INDEXNOW_SITE_URL = "https://houdinimd.com";
export const INDEXNOW_KEY = "0a93ae91427554a6fe1bcd060786eb72";

const ENDPOINTS = ["https://api.indexnow.org/indexnow"];

export interface IndexNowResult {
  endpoint: string;
  status: number;
  ok: boolean;
  error?: string;
}

/** IndexNow accepts up to 10,000 URLs per submission. */
const MAX_URLS_PER_SUBMISSION = 10_000;

export async function submitToIndexNow(
  host: string,
  urls: string[],
  key: string = INDEXNOW_KEY,
): Promise<IndexNowResult[]> {
  if (urls.length === 0) return [];
  if (urls.length > MAX_URLS_PER_SUBMISSION) {
    throw new Error(`IndexNow accepts at most ${MAX_URLS_PER_SUBMISSION} URLs per submission (got ${urls.length})`);
  }

  const body = JSON.stringify({
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: urls,
  });

  const results: IndexNowResult[] = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body,
      });
      results.push({ endpoint, status: res.status, ok: res.ok });
    } catch (err) {
      results.push({ endpoint, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
