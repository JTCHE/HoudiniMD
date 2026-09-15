"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ControlButton } from "@/components/ui/control-button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DOC_LINK_CLASS_NAME } from "@/components/docs/DocLink";

/**
 * The notice lives in `public/notice.json`, NOT in this file.
 *
 * Every doc page's HTML is an object in the R2 incremental cache, ~21k of
 * them. Copy written here would reach them one of two ways, and both cost a
 * full rewrite of the cache: rendered on the server it lands in the HTML
 * itself, and rendered on the client it lands in a chunk whose content-hashed
 * name the HTML carries in a script tag.
 *
 * A file in `public/` is neither. It is a static asset, served by the asset
 * server without touching the Worker, and it is in no chunk. Change the copy,
 * or set `show` to false, and the next deploy rewrites that one file and no
 * cache object at all.
 *
 * `kind` is in the JSON for the same reason. The notice has to carry the email
 * field until the release mail goes out, then the download. Both forms ship
 * here once, and the switch between them is a one-word edit to a static file.
 *
 * The price is that the code below must not change either — an edit here moves
 * the chunk hash and the 21k rewrite comes back.
 */
const NOTICE_URL = "/notice.json";

/** One block per kind. The handoff is a one-word edit to `kind`, and each
    kind keeps its own wording: a waitlist asks, a release tells. */
interface Copy {
  title?: string;
  body?: string;
  promise?: string;
  placeholder?: string;
  submitLabel?: string;
  signedLabel?: string;
  linkLabel?: string;
  linkHref?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Where a reader who is not on Windows goes instead. */
  altLabel?: string;
  altHref?: string;
}

interface Notice {
  show?: boolean;
  kind?: "waitlist" | "download";
  waitlist?: Copy;
  download?: Copy;
}

type State = "idle" | "sending" | "done" | "error";

/** Set once an address is accepted. A reader who signed up is done with the
    field on every page, not only the one they typed on. */
const SIGNED_KEY = "houdinimd:wind-down-signed";

/**
 * What the LAST visit saw. The inline script in the document head reads this
 * before the first paint and hides the notice when this reader closed it, so a
 * closed bar is never drawn and the page does not jump.
 *
 * `dismissed` holds the KIND that was closed, not a flag. A reader who closed
 * the waitlist has not closed the download, so the release notice comes back
 * one time for everybody.
 */
const STATE_KEY = "houdinimd:notice";

interface Saved {
  kind?: string;
  show?: boolean;
  dismissed?: string;
}

function readState(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

/** The app runs on Windows only. Every other reader gets the source. */
function onWindows() {
  if (typeof navigator === "undefined") return false;
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /win/i.test(data?.platform ?? navigator.userAgent);
}

/** Windows. Not in lucide, which carries no brand marks. */
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

/**
 * The wind-down notice and the call to action are one component on purpose: a
 * reader learns the site closes and can act on it without moving.
 *
 * The negative inline margin matches the horizontal padding exactly, so the
 * copy sits on the same vertical axis as the page title and everything under
 * it. Without it the box reads as indented against every neighbour.
 *
 * "bar" is the form on a doc page, which carries its own page container.
 */
export function WindDown({ variant = "banner" }: { variant?: "banner" | "bar" }) {
  const pathname = usePathname();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [signed, setSigned] = useState(false);
  const [closed, setClosed] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    // A static asset, so the browser and the service worker both cache it and
    // a second page costs no request. A failure leaves the notice absent,
    // which is the safe way for it to fail.
    fetch(NOTICE_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: Notice | null) => {
        if (!live) return;
        // Read here, not in the effect body: the answer arrives asynchronously
        // anyway, and a synchronous setState in an effect cascades a render.
        try {
          const saved = readState();
          if (localStorage.getItem(SIGNED_KEY) === "1") setSigned(true);
          if (variant === "bar" && saved.dismissed && saved.dismissed === body?.kind) setClosed(true);
          localStorage.setItem(
            STATE_KEY,
            JSON.stringify({ kind: body?.kind, show: body?.show, dismissed: saved.dismissed }),
          );
        } catch {
          // Private mode. The notice comes back next visit, which is acceptable.
        }
        setNotice(body);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [variant]);

  function dismiss() {
    setClosed(true);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), dismissed: notice?.kind }));
    } catch {}
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
      try {
        localStorage.setItem(SIGNED_KEY, "1");
      } catch {}
    } catch {
      setState("error");
      setMessage("No connection. Try again.");
    }
  }

  // The CARD is drawn from the first paint, empty; only the words wait for the
  // JSON. A notice that appeared late pushed every page down after it loaded,
  // and the reader lost their place. The shell holds the space instead, and it
  // carries no copy, so the prerendered HTML says nothing about the notice.
  //
  // A reader who closed the bar, or a notice that is off, still has to leave no
  // gap. The inline script in the head reads the last visit's answer from
  // localStorage and hides the shell before the first paint; this return then
  // removes it once the JSON confirms.
  if (closed || (notice && !notice.show)) return null;

  const copy: Copy = (notice?.kind === "download" ? notice?.download : notice?.waitlist) ?? {};
  const done = state === "done" || (signed && state === "idle");
  // The key sends a Windows reader to the installer and everyone else to the
  // source, so no reader downloads a build their machine cannot run.
  const windows = onWindows();
  const ctaHref = windows ? copy.ctaHref : copy.altHref;
  const ctaLabel = windows ? copy.ctaLabel : copy.altLabel;

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
          <p className="text-label text-foreground space-x-sm line-clamp-2 min-h-[2lh] md:line-clamp-1 md:min-h-[1lh]">
            <strong className="font-medium">{copy.title}</strong>
            {copy.linkHref && copy.linkLabel && (
              <strong className="font-medium">
                <a
                  className={DOC_LINK_CLASS_NAME + " text-neutral-500 hover:text-neutral-800 transition"}
                  href={copy.linkHref}
                >
                  {copy.linkLabel}
                </a>
              </strong>
            )}
          </p>
          <p className="text-meta text-muted-foreground whitespace-pre-line line-clamp-2 min-h-[2lh] md:line-clamp-1 md:min-h-[1lh]">
            {copy.body}
          </p>
        </div>

        {/* The key and the cross are one group, not two flex children. Under
            `justify-between` two children split the leftover width twice and
            leave a hole between them. */}
        <div className="flex min-h-12 w-full shrink-0 items-center gap-sm md:w-auto">
          {notice?.kind === "waitlist" && !done && (
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
                  placeholder={copy.placeholder}
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
                  // The download key's own padding. One key, one look, whichever
                  // call to action the notice carries.
                  className="px-md py-sm leading-none"
                >
                  {state === "sending" ? "Sending" : copy.submitLabel}
                </ControlButton>
              </div>
              {/* Under the field, where the reader looks last before they type.
                  Beside the rest of the copy it read as one more sentence to
                  skip, and the promise is the part that earns the address. A
                  failure speaks in the same place, beside the control that
                  caused it, so the notice copy above never moves. */}
              {/* Not cn(): tailwind-merge does not know the custom `text-caption` size,
                  reads it as a colour, and lets `text-muted-foreground` evict it. */}
              {(state === "error" || copy.promise) && (
                <p
                  role="status"
                  className={`text-caption ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {state === "error" ? message : copy.promise}
                </p>
              )}
            </form>
          )}

          {notice?.kind === "waitlist" && done && (
            <p
              role="status"
              className="text-label shrink-0 text-foreground"
            >
              {copy.signedLabel}
            </p>
          )}
          {notice?.kind === "download" && ctaHref && ctaLabel && (
            <ControlButton
              href={ctaHref}
              icon={windows ? <WindowsMark className="size-4" /> : <GitHubMark className="size-4" />}
              // `p-md` overrides the key's own 16/8: one number, 16, on all
              // four sides, so the key is inset from the card by the same
              // amount everywhere. The card's radius follows from it, 24 = the
              // key's own 8 plus that 16.
              //
              // `leading-none` stops the label's line box, which is taller
              // than its glyphs, from adding half-leading at the top and the
              // bottom only.
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
