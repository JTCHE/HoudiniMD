export const SIDEFX_ORIGIN = "https://www.sidefx.com";
export const SIDEFX_DOCS_ROOT = `${SIDEFX_ORIGIN}/docs`;
export const HOUDINI_DOCS_ROOT = `${SIDEFX_DOCS_ROOT}/houdini`;
export const HOUDINI_ICON_ROOT = `${HOUDINI_DOCS_ROOT}/icons`;

/**
 * The latest/current major Houdini version.
 *
 * Bump this when SideFX ships a new major version.
 */
export const LATEST_HOUDINI_VERSION = "22";

/** Matches the versioned docs root, e.g. "houdini21.0" or "houdini20.5" — the
 * unversioned "houdini" root (no trailing digits) always tracks LATEST_HOUDINI_VERSION. */
const VERSIONED_ROOT = /^houdini(\d[\d.]*)$/;

/** Returns the version (e.g. "21.0") if slugPath is on an explicitly versioned,
 * no-longer-updated docs tree, or null if it's on the current "houdini/" root. */
export function legacyVersion(slugPath: string): string | null {
  return slugPath.split("/")[0].match(VERSIONED_ROOT)?.[1] ?? null;
}

/** Same slug, rewritten onto the current "houdini/" root. */
export function currentVersionSlug(slugPath: string): string {
  const rest = slugPath.split("/").slice(1);
  return ["houdini", ...rest].join("/");
}
