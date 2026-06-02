/**
 * The latest/current major Houdini version.
 *
 * SideFX's unversioned docs (https://www.sidefx.com/docs/houdini/) always track
 * this release, so the versioned "What's new" page for it
 * (houdini/news/<LATEST>/index) is redundant and is redirected to our `/docs/houdini`
 * root instead of being mirrored. Older versions are mirrored as normal docs.
 *
 * Bump this when SideFX ships a new major version.
 */
export const LATEST_HOUDINI_VERSION = "21";

/**
 * Slugs (path after /docs/) that point at the latest version's "What's new"
 * page and should redirect to `/docs/houdini`. Includes the correct
 * `houdini/news/<v>/index` form plus the legacy `houdini/<v>/index` form that
 * older cached pages produced before relative-link resolution was fixed.
 */
export const LATEST_NEWS_INDEX_SLUGS = [
  `houdini/news/${LATEST_HOUDINI_VERSION}/index`,
  `houdini/${LATEST_HOUDINI_VERSION}/index`,
];
