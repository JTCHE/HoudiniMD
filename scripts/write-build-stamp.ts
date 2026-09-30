#!/usr/bin/env bun
/**
 * Stamp this build: writes lib/build-stamp.ts before `opennextjs-cloudflare
 * build`, for the Worker to read.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const stamp = Date.now().toString(36);

writeFileSync(
  join(root, "lib/build-stamp.ts"),
  `/**
 * Written by \`scripts/write-build-stamp.ts\` before every build. The committed
 * value is a placeholder; the deployed one is the build's own.
 *
 * It names the build in the edge cache key (lib/edge-cache.ts), so a deploy
 * starts that cache empty instead of replaying the build before it.
 */
export const BUILD_STAMP = "${stamp}";
`,
);

console.log(`build stamp ${stamp}`);
