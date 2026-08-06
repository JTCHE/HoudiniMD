/**
 * Asking the server to mirror a page, from the browser.
 *
 * Two calls, no React: `/api/resolve` turns a bare name into a slug, and
 * `/api/generate` streams the mirror job back as server-sent events. Every
 * caller that can send someone to a page they have not mirrored yet — the
 * landing field, the search overlay, the 404 page — goes through here, so the
 * wire format is described in exactly one place.
 */
import type { ProgressEvent } from "@/lib/generator";

/** Thrown when the server refuses a name. `message` is already reader-facing. */
export class ResolveError extends Error {}

/**
 * Turn a bare name ("pyro solver") into an index slug.
 *
 * Throws `ResolveError` with the server's own wording when nothing matches —
 * the server knows why better than the caller does.
 */
export async function resolveName(name: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`/api/resolve?name=${encodeURIComponent(name)}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new ResolveError(data.error ?? `No documentation found for "${name}".`);
  return data.slug as string;
}

/**
 * Mirror `slug`, reporting each stage as it happens.
 *
 * Resolves once the stream ends. It always ends on a terminal event: if the
 * connection drops before one arrives, a synthetic `error` is delivered, so a
 * caller never has to tell "still working" apart from "the socket died".
 */
export async function streamMirror(
  slug: string,
  onEvent: (event: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/generate?slug=${encodeURIComponent(slug)}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let sawTerminalEvent = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; the tail is a partial frame.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      if (!frame.startsWith("data: ")) continue;
      let event: ProgressEvent;
      try {
        event = JSON.parse(frame.slice(6));
      } catch {
        console.error("Failed to parse SSE event:", frame);
        continue;
      }
      if (event.stage === "complete" || event.stage === "error") sawTerminalEvent = true;
      onEvent(event);
    }
  }

  if (!sawTerminalEvent) {
    onEvent({
      stage: "error",
      message: "Connection lost",
      detail: "The server timed out or the connection was interrupted. Please try again.",
    });
  }
}
