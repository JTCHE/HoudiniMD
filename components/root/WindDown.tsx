"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlButton } from "@/components/ui/control-button";
import { DownloadKey } from "@/components/ui/download-key";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DOC_LINK_CLASS_NAME } from "@/components/docs/DocLink";
import { NOTICE_STATE_KEY } from "@/lib/notice";
import { BRANCH, COPY_SCRIPT_ID, SLOT } from "@/lib/notice-rewrite";
import { NOTICE_COPY, NOTICE_KIND, type NoticeCopy, type NoticeKind } from "@/lib/notice-copy";

type State = "idle" | "sending" | "done" | "error";

/**
 * Hidden for the rest of this tab: the reader closed the notice, or signed.
 *
 * A module value, not component state, because a navigation mounts the
 * component again. State would come back as "show", and the card would flash
 * on a page the reader already closed it on.
 */
let hiddenForTab = false;

/** The empty shape the prerender draws. `worker.ts` writes the words in. */
const NO_COPY = {} as Partial<NoticeCopy>;

let copyCache: Partial<NoticeCopy> | null = null;

/**
 * The copy, for the renders that the Worker cannot reach.
 *
 * The first paint is finished HTML: the Worker filled the slots below as the
 * page streamed. A click inside the site renders this component again, from a
 * chunk that carries no copy, so it reads the same words back out of the JSON
 * the Worker hung in the head. Nothing is fetched and nothing arrives late.
 *
 * `next dev` has no Worker in front of it, so development reads the file the
 * Worker would have read. The branch folds away in a production build, which
 * is what keeps the copy out of the chunk.
 */
function copy(): Partial<NoticeCopy> {
  if (copyCache) return copyCache;
  if (typeof document !== "undefined") {
    const raw = document.getElementById(COPY_SCRIPT_ID)?.textContent;
    if (raw) {
      try {
        copyCache = JSON.parse(raw) as NoticeCopy;
        return copyCache;
      } catch {
        // Nothing to do. An empty card is better than a thrown render.
      }
    }
  }
  return process.env.NODE_ENV === "development" ? NOTICE_COPY : NO_COPY;
}

/** Which notice is live. The Worker stamps it on the `html` tag. */
function kind(): NoticeKind | undefined {
  if (typeof document !== "undefined") {
    const stamped = document.documentElement.dataset.noticeKind;
    if (stamped === "waitlist" || stamped === "download") return stamped;
  }
  return process.env.NODE_ENV === "development" ? NOTICE_KIND : undefined;
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
 * What is drawn here is the SHAPE. The words belong to `worker.ts`, which
 * writes them into the response as it streams — lib/notice-copy.ts says why.
 * The build prerenders both calls to action and the Worker drops the one the
 * notice is not using, so the switch at the announcement is one word in a file
 * the cached pages do not carry.
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
  const live = kind();
  const text = copy();
  // No answer means this is the build's own render, and the build must draw
  // both: the Worker is what picks, and it can only pick from what is there.
  const showWaitlist = live === undefined || live === "waitlist";
  const showDownload = live === undefined || live === "download";

  function dismiss() {
    hiddenForTab = true;
    setClosed(true);
    saveState({ dismissed: live });
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
            <strong
              className="font-medium"
              {...{ [SLOT]: "title" }}
            >
              {text.title}
            </strong>
            <strong className="font-medium">
              <a
                className={DOC_LINK_CLASS_NAME + " text-neutral-500 hover:text-neutral-800 transition"}
                href={text.linkHref}
                {...{ [SLOT]: "linkLabel" }}
              >
                {text.linkLabel}
              </a>
            </strong>
          </p>
          <p
            className="text-meta text-muted-foreground whitespace-pre-line"
            {...{ [SLOT]: "body" }}
          >
            {text.body}
          </p>
        </div>

        {/* The key and the cross are one group, not two flex children. Under
            `justify-between` two children split the leftover width twice and
            leave a hole between them. */}
        <div className="flex w-full shrink-0 items-center gap-sm md:w-auto">
          {showWaitlist && (
            <div
              className="flex w-full shrink-0 md:w-auto"
              {...{ [BRANCH]: "waitlist" }}
            >
              {state !== "done" ? (
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
                      placeholder={text.placeholder}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      aria-invalid={state === "error"}
                      // No height of its own: the key sets the row's height and
                      // the field takes it, so the two controls are one line.
                      className="h-auto min-w-0 flex-1 px-ms md:w-52 md:flex-none"
                      {...{ [SLOT]: "placeholder" }}
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
                      <span {...{ [SLOT]: "submitLabel" }}>{state === "sending" ? "Sending" : text.submitLabel}</span>
                    </ControlButton>
                  </div>
                  {/* A failure speaks beside the control that caused it, so the
                      notice copy above never moves.
                      Not cn(): tailwind-merge does not know the custom
                      `text-caption` size, reads it as a colour, and lets a
                      colour class evict it. */}
                  {state === "error" && (
                    <p
                      role="status"
                      className="text-caption text-destructive"
                    >
                      {message}
                    </p>
                  )}
                </form>
              ) : (
                <p
                  role="status"
                  className="text-label shrink-0 text-foreground"
                  {...{ [SLOT]: "signedLabel" }}
                >
                  {text.signedLabel}
                </p>
              )}
            </div>
          )}

          {showDownload && (
            <DownloadKey
              className="w-full md:w-auto"
              {...{ [BRANCH]: "download" }}
            />
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
