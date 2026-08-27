"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 1 Jan 2027. Agreed with SideFX — see the Site Wind Down spec. */
const CLOSURE_DATE = "Jan 1st, 2027";
const DISMISS_KEY = "houdinimd:wind-down-dismissed";
/** Set once an address is accepted. A reader who signed up is done with the
    notice on every page, not only the one they typed on. */
const SIGNED_KEY = "houdinimd:wind-down-signed";

type State = "idle" | "sending" | "done" | "error";

const subscribeToStorage = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

/** One string, not an object: useSyncExternalStore compares snapshots by
    identity and a fresh object every read loops forever. */
const readFlag = (): "none" | "dismissed" | "signed" => {
  try {
    if (localStorage.getItem(SIGNED_KEY) === "1") return "signed";
    if (localStorage.getItem(DISMISS_KEY) === "1") return "dismissed";
    return "none";
  } catch {
    return "none";
  }
};

/**
 * The wind-down notice and the waitlist field are one component on purpose: a
 * reader learns the site closes and can act on it without moving.
 *
 * The negative inline margin matches the horizontal padding exactly, so the
 * copy sits on the same vertical axis as the page title and everything under
 * it. Without it the box reads as indented against every neighbour.
 *
 * "bar" is the dismissable form on a doc page, where the notice must stay out
 * of the reader's way.
 */
export function WindDown({ variant = "banner" }: { variant?: "banner" | "bar" }) {
  const pathname = usePathname();
  // Read through useSyncExternalStore, not an effect: the server has no
  // localStorage, so the server snapshot says "dismissed" and the bar never
  // flashes at a reader who already closed it. `closed` covers this tab's own
  // click and its own signup, neither of which fires a storage event.
  const stored = useSyncExternalStore(subscribeToStorage, readFlag, () => "dismissed" as const);
  const [closed, setClosed] = useState(false);
  // Separate from `closed`: the bar hides itself after a signup, but only
  // once the confirmation has had time to be read.
  const [hidden, setHidden] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  function remember(key: string) {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Private mode. The notice comes back next visit, which is acceptable.
    }
  }

  function dismiss() {
    setClosed(true);
    remember(DISMISS_KEY);
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
        setMessage(
          body.error ??
            (response.status === 429
              ? "Too many tries. Wait a minute."
              : "That did not work. Try again."),
        );
        return;
      }
      setState("done");
      remember(SIGNED_KEY);
      // The confirmation is worth reading, so the bar stays a moment before it
      // goes. It does not come back: SIGNED_KEY is already written.
      if (variant === "bar") setTimeout(() => setHidden(true), 4000);
    } catch {
      setState("error");
      setMessage("No connection. Try again.");
    }
  }

  // `stored` is re-read on every render, so it turns "signed" the moment the
  // address lands. Hiding on it alone would swallow the confirmation, hence
  // the `state === "idle"` guard: a stored answer only hides a bar that has
  // nothing to say right now.
  if (variant === "bar" && (hidden || closed || (stored !== "none" && state === "idle")))
    return null;
  // Someone who already signed up still needs the closure date on the landing
  // page, but not the field again.
  const signedEarlier = stored === "signed" && state === "idle";

  const card = (
    <aside
      className={cn(
        // Even padding all round, on every side, at every width.
        "relative -mx-md rounded-lg border border-hairline bg-surface p-md",
      )}
    >
      <div className="flex flex-col gap-md md:gap-xl md:flex-row md:items-center md:justify-between">
        <div className={cn("min-w-0", variant === "bar" && "pr-2xl md:pr-0")}>
          <p className="text-label text-foreground">
            <strong className="font-medium">
              HoudiniMD closes on {CLOSURE_DATE}. It&apos;s being replaced by a free, open-source app.
            </strong>
          </p>
          <p className="text-meta text-muted-foreground whitespace-pre-line">
            {"SideFX owns the documentation and did not give permission to host it.\nThis new app will read the docs already installed with Houdini."}
          </p>
        </div>

        {state !== "done" && !signedEarlier && (
          <form
            onSubmit={submit}
            className="flex w-full shrink-0 flex-col gap-2xs md:w-auto"
          >
            <div className="flex w-full items-center gap-sm">
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
                placeholder="you@studio.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={state === "error"}
                className="h-8 min-w-0 flex-1 -ml-2.5 px-2.5 py-4 md:w-52 md:flex-none"
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
              <Button
                type="submit"
                size="sm"
                disabled={state === "sending"}
                // Mirrors the field: same inner padding, same pull outwards, so
                // the label sits on the card's padding line instead of inside it.
                className="-mr-2.5 cursor-pointer px-2.5"
              >
                {state === "sending" ? "Sending" : "Notify me"}
              </Button>
            </div>
            {/* Under the field, where the reader looks last before they type.
                Beside the rest of the copy it read as one more sentence to
                skip, and the promise is the part that earns the address. A
                failure speaks in the same place, beside the control that
                caused it, so the notice copy above never moves. */}
            {/* Not cn(): tailwind-merge does not know the custom `text-caption` size,
                reads it as a colour, and lets `text-muted-foreground` evict it. */}
            <p className={`text-caption ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {state === "error" ? message : "One email at release. Nothing else, ever."}
            </p>
          </form>
        )}

        {(state === "done" || signedEarlier) && (
          <p className="text-label shrink-0 text-foreground">You are on the list. One email at release.</p>
        )}

        {/* Absolute below md, where it floats over the copy and the copy makes
            room for it. A real flex item from md up, where the form already
            fills the top-right corner — reserving padding for it there is what
            made the right inset wider than the left. */}
        {variant === "bar" && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            className="absolute right-md top-md cursor-pointer text-muted-foreground hover:text-foreground md:static md:self-start"
            onClick={dismiss}
          >
            <X />
          </Button>
        )}
      </div>
    </aside>
  );

  // The bar carries its own page container. Wrapping it in the doc shell
  // instead would leave an empty div in every prerendered page, so a dismissed
  // notice would still change 21k cached HTML outputs and make every deploy
  // rewrite the whole R2 cache. Returning null here leaves no markup at all.
  return variant === "bar" ? (
    <div className="@container mx-auto w-full max-w-page px-page-x pt-5">{card}</div>
  ) : (
    card
  );
}
