import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

// `queue: doQueue` moves ISR revalidation OFF the request path. Without it,
// OpenNext revalidates stale pages inline (in waitUntil), and that render is
// charged to the visitor's request CPU — on Workers' 10ms free-tier limit it
// blows the budget and returns 1102/503. With the Durable Object queue, a
// stale hit is served from cache immediately and the re-render is enqueued to
// the DO, which renders asynchronously and writes the fresh entry back to R2.
// The visitor always gets cached content; revalidation never costs them a 503.
export default defineCloudflareConfig({
	incrementalCache: r2IncrementalCache,
	queue: doQueue,
});
