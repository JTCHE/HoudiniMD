import { recordApiSearch } from "./search";

async function capturedKind(userAgent: string): Promise<string> {
  const points: { blobs?: string[] }[] = [];
  const waits: Promise<unknown>[] = [];
  recordApiSearch(
    new Request("https://houdinimd.com/api/search?q=box", { headers: { "user-agent": userAgent, "sec-fetch-dest": "empty" } }),
    new URL("https://houdinimd.com/api/search?q=box"),
    Response.json({ total: 1 }),
    { ANALYTICS: { writeDataPoint: (point) => points.push(point) }, VISITOR_SALT: "test" },
    { waitUntil: (promise) => waits.push(promise) },
  );
  await Promise.all(waits);
  return points[0]?.blobs?.[8] ?? "";
}

console.assert(await capturedKind("Mozilla/5.0 Chrome/140.0.0.0") === "agent", "browser-shaped API caller is an agent");
console.assert(await capturedKind("Googlebot/2.1") === "crawler", "named crawler stays a crawler");
