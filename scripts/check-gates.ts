#!/usr/bin/env bun
// Fails the deploy when a switch in lib/features.ts is on and its other half is
// not live yet. See that file.

import { FEATURES, REQUIRES } from "../lib/features";
import { assetUrl, MANIFEST } from "../lib/download";

export /** Semver order, prerelease included ("0.1.0-beta.9" > "0.1.0-beta.10" is false). */
function atLeast(have: string, need: string): boolean {
  const parts = (v: string) => v.split(/[.-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  const [a, b] = [parts(have), parts(need)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    // A version with no prerelease tag is newer than one with it.
    if (a[i] === undefined) return typeof b[i] !== "number";
    if (b[i] === undefined) return typeof a[i] === "number";
    if (a[i] === b[i]) continue;
    if (typeof a[i] === typeof b[i]) return a[i] > b[i];
    return typeof a[i] === "number";
  }
  return true;
}

if (import.meta.main) {
  const on = (Object.keys(FEATURES) as (keyof typeof FEATURES)[]).filter((name) => FEATURES[name]);
  if (on.length === 0) process.exit(0);

  const response = await fetch(MANIFEST);
  const version = response.ok ? ((await response.json()) as { version?: string }).version : undefined;
  if (!version) {
    console.error(`check-gates: GitHub answered ${response.status}; cannot prove ${on.join(", ")}.`);
    process.exit(1);
  }

  const failed: string[] = [];
  for (const name of on) {
    const need = REQUIRES[name];
    const file = need.platform && (await fetch(assetUrl(version, need.platform), { method: "HEAD" }));
    if ((file && !file.ok) || (need.minAppVersion && !atLeast(version, need.minAppVersion))) failed.push(name);
  }

  for (const name of failed) {
    console.error(`check-gates: "${name}" is on, but release v${version} lacks ${REQUIRES[name as keyof typeof REQUIRES].why}.`);
  }
  process.exit(failed.length ? 1 : 0);
}
