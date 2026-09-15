"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlButton } from "@/components/ui/control-button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DOC_LINK_CLASS_NAME } from "@/components/docs/DocLink";
import { NOTICE, NOTICE_KIND, NOTICE_STATE_KEY } from "@/lib/notice";

type State = "idle" | "sending" | "done" | "error";

/**
 * Hidden for the rest of this tab: the reader closed the notice, or signed.
 *
 * A module value, not component state, because a navigation mounts the
 * component again. State would come back as "show", and the card would flash
 * on a page the reader already closed it on.
 */
let hiddenForTab = false;

/** Windows. Not in lucide, which carries no brand marks. */
function WindowsMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 5.6 10.4 4.6V11.4H3V5.6ZM11.6 4.4 21 3v8.4h-9.4V4.4ZM3 12.6h7.4v6.8L3 18.4v-5.8ZM11.6 12.6H21V21l-9.4-1.4v-7Z" />
    </svg>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.93.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}

function saveState(next: { dismissed?: string; signed?: boolean }) {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTICE_STATE_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(NOTICE_STATE_KEY, JSON.stringify({ ...saved, ...next }));
  } catch {
    // Private mode. The notice comes back next visit, which is acceptable.
  }
}

/**
 * The wind-down notice and the call to action are one component on purpose: a
 * reader learns the site closes and can act on it without moving.
 *
 * The copy is prerendered into every page — lib/notice.ts says what that costs
 * and why it is worth it. Nothing here waits for a request, so the card is
 * complete in the first paint and no page moves under the reader.
 *
 * The negative inline margin matches the horizontal padding exactly, so the
 * copy sits on the same vertical axis as the page title and everything under
 * it. Without it the box reads as indented against every neighbour.
 *
 * "bar" is the form on a doc page, which carries its own page container.
 */
export function WindDown({ variant = "banner" }: { variant?: "banner" | "bar" }) {
  const pathname = usePathname();
  const [closed, setClosed] = useState(hiddenForTab);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  // Windows is the prerendered answer, because the installer is the point of
  // the notice and most readers are on Windows. Everybody else is corrected
  // after hydration. Only the label moves, and only for them.
  const [windows, setWindows] = useState(true);

  useEffect(() => {
    const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    setWindows(/win/i.test(data?.platform ?? navigator.userAgent));
  }, []);

  function dismiss() {
    hiddenForTab = true;
    setClosed(true);
    saveState({ dismissed: NOTICE_KIND });
    // The head script sets this on the next visit. Set it here as well, so the
    // card stays gone through the navigations of this one.
    document.documentElement.dataset.notice = "dismissed";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, page: pathname, website: form.get("website") ?? "" }),
      });
      // Not every answer is JSON. An edge error or a stale service worker
      // replies with an HTML page, and response.json() throws on it.
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState("error");
        // The status is the reliable part. A 429 from the edge, rather than
        // from the worker, carries an HTML body and no `error` to read.
        setMessage(body.error ?? (response.status === 429 ? "Too many tries. Wait a minute." : "That did not work. Try again."));
        return;
      }
      setState("done");
      // The thank-you stays on this page, and the notice is gone from the next
      // one. A reader who signed has nothing left to do with it.
      hiddenForTab = true;
      saveState({ signed: true });
    } catch {
      setState("error");
      setMessage("No connection. Try again.");
    }
  }

  if (closed) return null;

  const copy = NOTICE[NOTICE_KIND];
  const waitlist = NOTICE_KIND === "waitlist" ? NOTICE.waitlist : null;
  const download = NOTICE_KIND === "download" ? NOTICE.download : null;
  const ctaHref = windows ? download?.ctaHref : download?.altHref;
  const ctaLabel = windows ? download?.ctaLabel : download?.altLabel;

  const card = (
    <aside
      className={cn(
        // One inset, `md`, on all four sides: the prose starts 16px from the
        // left edge and the control ends 16px from the right. The search field
        // gets away with 16 left and 4 right because its key fills the well
        // top to bottom, so that 4 wraps three sides of it at once. This key is
        // centred against taller prose and shares no corner with the card, so
        // the same trick reads as a button shoved against the wall.
        //
        // The corners follow from that inset. `rounded-4xl` is 24px: the key's
        // own 8 plus the 16 around it. The field obeys the same rule at its own
        // size, 12 = 8 + 4.
        "wind-down relative -mx-md rounded-4xl border border-hairline bg-surface p-md",
        variant === "bar" && "wind-down-bar",
        // The two edge lines the field carries. Below the dark page there is
        // only black, so the lit lip takes the next step up the ramp.
        "dark:border-black",
        "ring-1 ring-inset ring-neutral-0 dark:ring-neutral-100",
      )}
    >
      <div className="flex flex-col gap-md md:flex-row md:items-center md:justify-between md:gap-xl">
        <div className={cn("min-w-0", variant === "bar" && "pr-2xl md:pr-0")}>
          <p className="text-label text-foreground space-x-sm">
            <strong className="font-medium">{copy.title}</strong>
            <strong className="font-medium">
              <a
                className={DOC_LINK_CLASS_NAME + " text-neutral-500 hover:text-neutral-800 transition"}
                href={copy.linkHref}
              >
                {copy.linkLabel}
              </a>
            </strong>
          </p>
          <p className="text-meta text-muted-foreground whitespace-pre-line">{copy.body}</p>
        </div>

        {/* The key and the cross are one group, not two flex children. Under
            `justify-between` two children split the leftover width twice and
            leave a hole between them. */}
        <div className="flex w-full shrink-0 items-center gap-sm md:w-auto">
          {waitlist && state !== "done" && (
            <form
              onSubmit={submit}
              className="flex w-full shrink-0 flex-col gap-2xs md:w-auto"
            >
              <div className="flex w-full items-stretch gap-sm">
                <label
                  htmlFor={`waitlist-${variant}`}
                  className="sr-only"
                >
                  Email address
                </label>
                <Input
                  id={`waitlist-${variant}`}
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder={waitlist.placeholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={state === "error"}
                  // No height of its own: the key sets the row's height and the
                  // field takes it, so the two controls are one line.
                  className="h-auto min-w-0 flex-1 px-ms md:w-52 md:flex-none"
                />
                {/* Honeypot. Hidden from people and from screen readers, filled by bots. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute left-[-9999px] h-px w-px opacity-0"
                />
                <ControlButton
                  type="submit"
                  disabled={state === "sending"}
                  className="px-md py-sm leading-none"
                >
                  {state === "sending" ? "Sending" : waitlist.submitLabel}
                </ControlButton>
              </div>
              {/* A failure speaks beside the control that caused it, so the
                  notice copy above never moves.
                  Not cn(): tailwind-merge does not know the custom `text-caption`
                  size, reads it as a colour, and lets a colour class evict it. */}
              {state === "error" && (
                <p
                  role="status"
                  className="text-caption text-destructive"
                >
                  {message}
                </p>
              )}
            </form>
          )}

          {waitlist && state === "done" && (
            <p
              role="status"
              className="text-label shrink-0 text-foreground"
            >
              {waitlist.signedLabel}
            </p>
          )}

          {download && ctaHref && ctaLabel && (
            <ControlButton
              href={ctaHref}
              icon={windows ? <WindowsMark className="size-4" /> : <GitHubMark className="size-4" />}
              // `leading-none` stops the label's line box, which is taller than
              // its glyphs, from adding half-leading at the top and the bottom
              // only.
              className="w-full justify-center px-md py-sm leading-none md:w-auto"
            >
              {ctaLabel}
            </ControlButton>
          )}

          {variant === "bar" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              // Absolute below md, where the key is full width and leaves the
              // cross no room in the row: it floats over the top-right corner
              // and the prose makes room for it. A real flex item from md up,
              // where the key shrinks to its label and the row has a gap to
              // put it in.
              className="absolute right-md top-md shrink-0 cursor-pointer text-muted-foreground hover:text-foreground md:static"
              onClick={dismiss}
            >
              <X />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );

  return variant === "bar" ? (
    <div className="wind-down wind-down-bar @container mx-auto w-full max-w-page px-page-x pt-5">{card}</div>
  ) : (
    card
  );
}
