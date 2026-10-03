"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ControlButton } from "@/components/ui/control-button";
import { cn } from "@/lib/utils";
import { FALLBACK, PLATFORMS, type Platform } from "@/lib/download";
import { FEATURES } from "@/lib/features";

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

function AppleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M16.37 12.64c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.88-1.28 1.24-2.52 1.26-2.59-.03-.01-2.41-.93-2.43-3.65ZM14.1 5.9c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.67-1.09 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.27Z" />
    </svg>
  );
}

/** Tux, simplified to a silhouette that reads at 16px. */
function LinuxMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2c-2.2 0-3.6 1.8-3.6 4.3 0 1.3.3 2.2-.3 3.3-.9 1.5-2.6 3.4-2.6 6 0 .9.2 1.6.5 2.2-.7.3-1.6.6-1.6 1.4 0 1 1.7 1 3 1.4 1 .3 1.6 1.4 2.7 1.4.8 0 1.3-.5 1.6-.9h.6c.3.4.8.9 1.6.9 1.1 0 1.7-1.1 2.7-1.4 1.3-.4 3-.4 3-1.4 0-.8-.9-1.1-1.6-1.4.3-.6.5-1.3.5-2.2 0-2.6-1.7-4.5-2.6-6-.6-1.1-.3-2-.3-3.3C15.6 3.8 14.2 2 12 2Zm-1.3 3.4c.4 0 .7.5.7 1.1 0 .6-.3 1.1-.7 1.1-.4 0-.7-.5-.7-1.1 0-.6.3-1.1.7-1.1Zm2.6 0c.4 0 .7.5.7 1.1 0 .6-.3 1.1-.7 1.1-.4 0-.7-.5-.7-1.1 0-.6.3-1.1.7-1.1ZM12 8.3c.9 0 2 .6 2 1 0 .5-1.1 1.2-2 1.2s-2-.7-2-1.2c0-.4 1.1-1 2-1Zm-2.3 3.4c.7.5 1.5.8 2.3.8s1.6-.3 2.3-.8c.9 1.3 1.6 2.6 1.6 4.2 0 1.9-1.6 3.2-3.9 3.2s-3.9-1.3-3.9-3.2c0-1.6.7-2.9 1.6-4.2Z" />
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

/** The platform does not change while the page is open, so nothing to watch. */
function subscribeNothing() {
  return () => {};
}

/** The desktop this page runs on, or null on a phone or tablet. */
function readPlatform(): Platform | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  const ua = nav.userAgent;
  // An iPad asks for the desktop site and says "Macintosh"; its touch points give it away.
  if (nav.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) {
    return null;
  }
  const platform = nav.userAgentData?.platform ?? ua;
  if (/win/i.test(platform)) return "windows";
  if (/mac/i.test(platform)) return "macos";
  if (/linux|x11/i.test(platform)) return "linux";
  return null;
}

/** Windows on the server; the real answer after hydration. */
function usePlatform() {
  return useSyncExternalStore(subscribeNothing, readPlatform, () => "windows" as const);
}

/** This desktop's build, or null on a phone and on a desktop with no build yet. */
function useBuild() {
  const platform = usePlatform();
  return platform && PLATFORMS[platform].ready ? { platform, ...PLATFORMS[platform] } : null;
}

/**
 * The download key: the build for this desktop, or the GitHub page on a phone
 * and on a desktop with no build yet.
 *
 * Windows is the prerendered answer, because most readers are on Windows.
 * Everybody else is corrected at hydration: `useSyncExternalStore` takes the
 * server answer and the client answer as two snapshots, which is how React
 * allows the two to differ.
 */
export function DownloadKey({ className, ...rest }: { className?: string } & Record<`data-${string}`, string | undefined>) {
  const build = useBuild();
  const { label, href } = build ?? FALLBACK;
  const icon = !build ? GitHubMark : build.platform === "windows" ? WindowsMark : build.platform === "macos" ? AppleMark : LinuxMark;
  return (
    <ControlButton
      href={href}
      icon={icon({ className: "size-4" })}
      // `leading-none` stops the label's line box, which is taller than its
      // glyphs, from adding half-leading at the top and the bottom only.
      className={cn("justify-center px-md py-sm leading-none", className)}
      {...rest}
    >
      {label}
    </ControlButton>
  );
}

/** The one-line install for a Mac: `public/install.sh`. */
const MAC_INSTALL = "curl -fsSL https://nodebook.md/install.sh | sh";

/**
 * Under the key on a Mac. The disk image is not notarized, so macOS asks for
 * "Open Anyway" once; a file from curl carries no download mark and opens at
 * once. A press copies the line.
 */
export function MacInstall({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const build = useBuild();
  const [copied, setCopied] = useState(false);
  if (build?.platform !== "macos") return null;
  const copy = () => {
    void navigator.clipboard?.writeText(MAC_INSTALL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    // A subtitle, not a second button: the line is for the reader who wants
    // it, so it reads at the size and the shade of a caption.
    <p style={style} className={cn("text-caption text-muted-foreground/80", className)}>
      Or in Terminal, with no &ldquo;Open Anyway&rdquo; step:{" "}
      <button
        type="button"
        onClick={copy}
        title="Copy"
        aria-label="Copy the install command"
        className="cursor-pointer font-mono text-[0.92em] text-muted-foreground underline decoration-transparent decoration-dotted underline-offset-4 transition-colors hover:text-foreground hover:decoration-current"
      >
        {copied ? "Copied" : MAC_INSTALL}
      </button>
    </p>
  );
}

/** Set by the first click on "Open in app": that reader has the app. */
const OPENS_IN_APP = "opens-in-app";

/**
 * Opens the page in the installed app. Only where the download key offers a
 * build: elsewhere there is no app to open. After one click, later visits open
 * the app by themselves. A reader who never clicked never gets a browser
 * prompt for an app they may not have.
 */
export function OpenInApp({ href }: { href: string }) {
  const build = useBuild();
  const on = FEATURES.openInApp && !!build;
  useEffect(() => {
    try {
      if (on && localStorage.getItem(OPENS_IN_APP)) window.location.href = href;
    } catch {}
  }, [on, href]);
  if (!on) return null;
  return (
    <a
      href={href}
      onClick={() => {
        try {
          localStorage.setItem(OPENS_IN_APP, "1");
        } catch {}
      }}
      className="text-label font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      Open in app
    </a>
  );
}
