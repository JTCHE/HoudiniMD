import { NOTICE_COPY, NOTICE_KIND, type NoticeCopy } from "./notice-copy";

/**
 * The notice, written into the page as it streams out of the Worker.
 *
 * The prerendered card is a shape with empty slots. This fills them, drops the
 * call to action the notice is not using, and hangs the copy on the document
 * as JSON. The reader gets finished HTML: no request, no late text, no jump.
 *
 * The JSON is for the navigations that follow. A click inside the site renders
 * the card from the client chunk, which carries no copy, so it reads the same
 * words back out of the document that the first paint used. The element lives
 * in the head, which survives every client-side navigation.
 *
 * `text/x-component` answers are left alone. They carry no markup for this
 * card: the client renders it, and the client reads the JSON.
 */

/** Marks the element whose text is one copy field. */
export const SLOT = "data-notice-slot";
/** Marks the branch that belongs to one kind of notice. */
export const BRANCH = "data-notice-branch";
/** Holds the copy for the renders that come after the first paint. */
export const COPY_SCRIPT_ID = "notice-copy";

/**
 * The rewriter, typed here. `worker.ts` is outside this tsconfig, so the
 * Cloudflare globals are not in scope for a file under `lib/`.
 */
interface RewriterElement {
  setInnerContent(content: string, options?: { html: boolean }): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  append(content: string, options?: { html: boolean }): void;
  remove(): void;
}

interface Rewriter {
  on(selector: string, handlers: { element(element: RewriterElement): void }): Rewriter;
  transform(response: Response): Response;
}

declare const HTMLRewriter: { new (): Rewriter };

export function rewriteNotice(response: Response): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;

  const copy = NOTICE_COPY;
  const text = (value: string) => ({
    element(element: RewriterElement) {
      element.setInnerContent(value);
    },
  });

  return new HTMLRewriter()
    // The kind reaches the script in the head this way, and that script runs
    // before the first paint. The attribute is on the tag that opens the
    // document, so it is set by the time the head is parsed.
    .on("html", {
      element(element) {
        element.setAttribute("data-notice-kind", NOTICE_KIND);
      },
    })
    .on("head", {
      element(element) {
        element.append(
          `<script type="application/json" id="${COPY_SCRIPT_ID}">${jsonForScript(copy)}</script>`,
          { html: true },
        );
      },
    })
    .on(`[${BRANCH}]`, {
      element(element) {
        if (element.getAttribute(BRANCH) !== NOTICE_KIND) element.remove();
      },
    })
    .on(`[${SLOT}="title"]`, text(copy.title))
    .on(`[${SLOT}="body"]`, text(copy.body))
    .on(`[${SLOT}="submitLabel"]`, text(copy.submitLabel))
    .on(`[${SLOT}="signedLabel"]`, text(copy.signedLabel))
    .on(`[${SLOT}="ctaLabel"]`, text(copy.ctaLabel))
    .on(`[${SLOT}="linkLabel"]`, {
      element(element) {
        element.setInnerContent(copy.linkLabel);
        element.setAttribute("href", copy.linkHref);
      },
    })
    .on(`[${SLOT}="placeholder"]`, {
      element(element) {
        element.setAttribute("placeholder", copy.placeholder);
      },
    })
    .on(`[${SLOT}="ctaHref"]`, {
      element(element) {
        element.setAttribute("href", copy.ctaHref);
      },
    })
    .transform(response);
}

/**
 * JSON that is safe between script tags. `</script>` inside a string would end
 * the element early, and the rest of the copy would become markup.
 */
function jsonForScript(copy: NoticeCopy): string {
  return JSON.stringify(copy).replace(/</g, "\\u003c");
}
