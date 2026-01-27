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

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const sendEvent = (event: ProgressEvent) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    controller.enqueue(encoder.encode(data));
  };

  const close = () => {
    controller.close();
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
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
