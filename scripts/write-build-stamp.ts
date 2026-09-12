#!/usr/bin/env bun
/**
 * Stamp this build.
 *
 * Runs before `opennextjs-cloudflare build`, and writes two files:
 *   lib/build-stamp.ts   the stamp itself, read by the Worker
 *   public/sw.js         the service worker, with the stamp in its cache name
 *
 * The service worker is generated rather than served from a route because a
 * route is a Worker invocation, and a cold one starts Next: measured 22-61
 * CPU-ms warm and ~430 cold for a file that never changes inside a build. A
 * file in public/ is served by the asset server and never reaches the Worker.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { serviceWorkerSource } from "../lib/sw-source";

const root = join(import.meta.dir, "..");
const stamp = Date.now().toString(36);

writeFileSync(
  join(root, "lib/build-stamp.ts"),
  `/**
 * Written by \`scripts/write-build-stamp.ts\` before every build. The committed
 * value is a placeholder; the deployed one is the build's own.
 *
 * It names the build in the edge cache key (lib/edge-cache.ts) and in the
 * service worker's cache name (lib/sw-source.ts), so a deploy starts both
 * caches empty instead of replaying the build before it.
 */
export const BUILD_STAMP = "${stamp}";
`,
);

writeFileSync(join(root, "public/sw.js"), serviceWorkerSource(stamp));

console.log(`build stamp ${stamp}`);
