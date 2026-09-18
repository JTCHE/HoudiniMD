/**
 * Print the public origin the Worker serves with, taken from wrangler.jsonc.
 *
 * The deploy chain exports this into `URL` so the build cannot disagree with
 * the runtime. It used to read `URL` from the build environment, which held
 * `http://localhost:3000`: every prerendered page went out with a localhost
 * canonical, og:url, JSON-LD id and markdown alternate link.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const raw = readFileSync(path.join(import.meta.dir, "..", "wrangler.jsonc"), "utf8");
// jsonc: line comments (only where a line starts with one, so a `//` inside a
// URL survives) and trailing commas.
const json = raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
const url: unknown = (JSON.parse(json) as { vars?: { URL?: unknown } }).vars?.URL;

if (typeof url !== "string" || !/^https:\/\//.test(url)) {
  console.error(`wrangler.jsonc vars.URL must be an https origin, got ${JSON.stringify(url)}`);
  process.exit(1);
}
process.stdout.write(url.replace(/\/+$/, ""));
