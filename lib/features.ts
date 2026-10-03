import type { Platform } from "./download";

// Features whose front end ships ahead of the part that makes it work.
//
// Each one stays `false` until its other half is live. `scripts/check-gates.ts`
// runs in the deploy and fails it when a switch is on and its `requires` does
// not hold against the live release, so a button with nothing behind it cannot
// reach production. Turn a switch on in the same change that meets its need.

export const FEATURES = {
  /** "Open in app" beside the download key. Needs an app release that registers the link scheme. */
  openInApp: true,
  /** The macOS download. Needs a `.dmg` on the latest release. */
  macosDownload: true,
} as const;

/** What each switch needs from the latest GitHub release: a platform's file
    on it, or an app version. */
export const REQUIRES: Record<keyof typeof FEATURES, { platform?: Platform; minAppVersion?: string; why: string }> = {
  openInApp: { minAppVersion: "0.2.1", why: "the app release that registers the link scheme" },
  macosDownload: { platform: "macos", why: "a macOS build on the release" },
};
