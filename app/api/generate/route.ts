import { NextRequest } from "next/server";
import {
  generateMarkdownForSlug,
  PageNotFoundError,
  type ProgressEvent,
} from "@/lib/generator";

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
  const slug = request.nextUrl.searchParams.get("slug");
  const skipCache = request.nextUrl.searchParams.get("regenerate") === "true";

  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { stream, sendEvent, close } = createSSEStream();

  // Process in background while streaming updates
  (async () => {
    try {
      await generateMarkdownForSlug(slug, skipCache, sendEvent);
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
  })().catch((err) => {
    // Final safeguard: catch any errors that escape during Lambda shutdown
    console.error(`Unhandled error in generation stream for ${slug}:`, err);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
