import { REPO_URL } from "./brand";
import { FEATURES } from "./features";

// Every platform the download key knows, and the release asset each one gets.
// `asset` is the end of the file name, after `<name>_<version>`, as the
// bundler writes it.
// `/download/<os>` resolves the asset in the Worker (lib/stored-answer.ts);
// `/download` alone is Windows, the address already in the wild.

export type Platform = "windows" | "macos" | "linux";

export const PLATFORMS: Record<Platform, { label: string; href: string; asset: string; ready: boolean }> = {
  windows: { label: "Download for Windows", href: "/download", asset: "_x64-setup.exe", ready: true },
  macos: { label: "Download for macOS", href: "/download/macos", asset: "_aarch64.dmg", ready: FEATURES.macosDownload },
  linux: { label: "Download for Linux", href: "/download/linux", asset: "_amd64.AppImage", ready: true },
};

/** A phone, or a platform with no build yet. */
export const FALLBACK = { label: "View on GitHub", href: REPO_URL };

/** The platform named in a `/download/<os>` path, or null. */
export function platformForPath(pathname: string): Platform | null {
  if (pathname === "/download") return "windows";
  const os = pathname.match(/^\/download\/(windows|macos|linux)$/)?.[1];
  return (os as Platform | undefined) ?? null;
}
