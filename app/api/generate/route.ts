import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  generateMarkdownForSlug,
  PageNotFoundError,
  type ProgressEvent,
} from "@/lib/generator";
import { isAuthorizedGenerateRequest, KICKOFF_HEADER } from "@/lib/generate-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let isClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      // Called when the client disconnects
      isClosed = true;
    },
  });

  const sendEvent = (event: ProgressEvent) => {
    if (isClosed) return;
    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      controller.enqueue(encoder.encode(data));
    } catch {
      // Stream already closed (client disconnected or Lambda timeout)
      isClosed = true;
    }
  };

  const close = () => {
    if (isClosed) return;
    try {
      controller.close();
    } catch {
      // Stream already closed
    }
    isClosed = true;
  };

  return { stream, sendEvent, close };
}

export async function GET(request: NextRequest) {
  // This route makes the Worker scrape sidefx.com. Reject anything that is not
  // our own page or our own kickoff — see lib/generate-auth.ts.
  if (!isAuthorizedGenerateRequest(request.headers)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const slug = request.nextUrl.searchParams.get("slug");
  const skipCache = request.nextUrl.searchParams.get("regenerate") === "true";

  if (slug === null) {
    return new Response(JSON.stringify({ error: "Missing slug parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Per-IP ceiling on how often one client may start a scrape. The internal
  // kickoff is exempt: it is already one call per page render, and throttling it
  // would leave crawler-visited slugs stuck on "Generating".
  if (request.headers.get(KICKOFF_HEADER) === null) {
    const { env } = await getCloudflareContext({ async: true });
    const limiter = env.GENERATE_LIMITER as RateLimiter;
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await limiter.limit({ key: ip });
    if (!success) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "60" },
      });
    }
  }

  const { stream, sendEvent, close } = createSSEStream();

  // Captured here, at request entry, while the isolate-global context slot
  // still holds *this* request. Both the generation itself and the search-index
  // write inside it are anchored to this one ctx; nothing downstream may
  // re-fetch it mid-run. See the search-index note in lib/generator.ts.
  const { ctx } = await getCloudflareContext({ async: true });

  const runGeneration = async () => {
    try {
      await generateMarkdownForSlug(slug, skipCache, sendEvent, (p) => ctx.waitUntil(p));
    } catch (error) {
      console.error(`Generation failed for ${slug}:`, error);

      if (error instanceof PageNotFoundError) {
        sendEvent({
          stage: "error",
          message: "Page not found",
          detail: "This page does not exist on SideFX's website",
        });
      } else {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        sendEvent({
          stage: "error",
          message: "Generation failed",
          detail: errorMessage,
        });
      }
    } finally {
      close();
    }
  };

  // Registered with ctx.waitUntil instead of just fired-and-forgotten: this
  // handler is also hit as a bare background kickoff from
  // app/docs/[...slug]/page.tsx (`ctx.waitUntil(fetch(...))`, never reads the
  // body). Without an explicit waitUntil here, this generation's survival
  // depended on something downstream keeping the SSE stream open — fine when
  // GeneratingPage's client-side EventSource is reading it, but the page.tsx
  // kickoff never reads it at all. Cloudflare is then free to tear down the
  // execution context the moment the Response is returned, cutting off
  // generateMarkdownForSlug() (and the updateSearchIndex() inside it) mid-run.
  // That produced live-but-unindexed pages — see "Content Index Misses Pages
  // That Are Live In R2". ctx.waitUntil() makes this survive regardless of
  // whether anyone ever drains the response body.
  ctx.waitUntil(
    runGeneration().catch((err) => {
      // Final safeguard: catch any errors that escape during Lambda shutdown
      console.error(`Unhandled error in generation stream for ${slug}:`, err);
    }),
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
