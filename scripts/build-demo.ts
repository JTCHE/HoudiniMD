/**
 * The copy of the desktop app on the landing page.
 *
 *   bun scripts/build-demo.ts                 # build the app into public/demo/app
 *   bun scripts/build-demo.ts --titles        # also read the title list again
 *
 * The landing page shows the app itself, not a drawing of it: this builds the
 * app's front end from its own repository (`APP_DIR`, the `main` branch
 * checkout beside this one) and puts `public/demo/stub.js` in front of it, in
 * place of Tauri. The build is committed, because the site's build machine
 * has no copy of the app.
 *
 * `--titles` reads the page titles, and the counts of the pages it leaves out
 * (`counts.json`), from the app running on this machine
 * (`http://localhost:<APP_PORT>`). Only the path, title, node type and folder
 * of each page are kept: no summary, no text, no icon. And only the pages the
 * tour can reach are kept: see `shown`.
 */
import { cpSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const APP_DIR = resolve(process.env.APP_DIR ?? "../HoudiniMD");
const APP_PORT = process.env.APP_PORT ?? "48800";
const OUT = resolve("public/demo");
const BASE = "/demo/app/";

const status = Bun.spawnSync(["git", "status", "--porcelain", "src"], { cwd: APP_DIR }).stdout.toString();
if (status.trim()) {
  console.error(`${APP_DIR}/src has changes nobody committed. Build the demo from a clean tree.`);
  process.exit(1);
}

const build = join(tmpdir(), `houdinimd-demo-${Date.now()}`);
const vite = Bun.spawnSync(
  ["bunx", "vite", "build", `--base=${BASE}`, "--outDir", build, "--emptyOutDir", "--sourcemap", "false"],
  { cwd: APP_DIR, stdout: "inherit", stderr: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
);
if (vite.exitCode !== 0) process.exit(vite.exitCode ?? 1);

// Only the page and its bundle: the app's public folder (README pictures,
// badges, the onboarding picture) is not used by the demo.
const app = join(OUT, "app");
if (existsSync(app)) renameSync(app, join(tmpdir(), `houdinimd-demo-old-${Date.now()}`));
cpSync(join(build, "assets"), join(app, "assets"), { recursive: true });
const html = readFileSync(join(build, "index.html"), "utf8").replace(
  "<head>",
  `<head>\n    <script src="/demo/stub.js"></script>`,
);
writeFileSync(join(app, "index.html"), html);

type Title = { path: string; title: string; nodeType?: string | null; place?: string[] };

/** Only the part of the tree the tour walks through: the geometry nodes, the
    VEX noise and scatter functions, the pages this site wrote, and the index
    pages above them. Not an index of the whole documentation. */
function shown(all: Title[]) {
  const written = Object.keys(JSON.parse(readFileSync(join(OUT, "pages/index.json"), "utf8")));
  const lines = Object.keys(JSON.parse(readFileSync(join(OUT, "pages/summaries.json"), "utf8")));
  const named = new Set([...written, ...lines]);
  const kept = all.filter(
    ({ path, place }) =>
      named.has(path) ||
      (path.startsWith("nodes/sop/") && place?.[0] === "Geometry") ||
      /^vex\/functions\/\w*(noise|scatter)/.test(path),
  );
  const dirs = new Set(kept.flatMap(({ path }) => path.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/"))));
  return all.filter((row) => kept.includes(row) || (row.path.endsWith("/index") && dirs.has(row.path.slice(0, -"/index".length))));
}

const titles = join(OUT, "titles.json");
const all: Title[] = process.argv.includes("--titles")
  ? await fetch(`http://localhost:${APP_PORT}/api/titles`).then((answer) => answer.json())
  : JSON.parse(readFileSync(titles, "utf8"));
const kept = shown(all).map(({ path, title, nodeType, place }) => ({
  path,
  title,
  nodeType: nodeType ?? undefined,
  place: place?.length ? place : undefined,
}));
writeFileSync(titles, JSON.stringify(kept));
console.log(`titles: ${kept.length}`);

/**
 * The pages the demo leaves out, counted by the folder the sidebar puts them
 * in, so its counts are an install's. `stub.js` fills each folder with rows
 * that no reader sees: a folder the tour opens gets none, and every other
 * folder is shut in the frame. Only numbers: no title leaves the install.
 *
 * A folder is keyed as the sidebar builds it (`src/lib/landing/tree.ts` in
 * the app): a node context or a top section, then the page's `place`.
 */
if (process.argv.includes("--titles")) writeCounts();

function writeCounts() {
  const folder = ({ path, place }: Title) =>
    [path.split("/").slice(0, path.startsWith("nodes/") ? 2 : 1).join("/"), ...(place ?? [])].join("|");
  const open = new Set(kept.flatMap((row) => folder(row).split("|").map((_, i, parts) => parts.slice(0, i + 1).join("|"))));
  const left: Record<string, number> = {};
  const keptPaths = new Set(kept.map((row) => row.path));
  for (const row of all) {
    if (keptPaths.has(row.path) || !row.title.trim() || row.path.endsWith("/index")) continue;
    const key = folder(row);
    if (!open.has(key)) left[key] = (left[key] ?? 0) + 1;
  }
  // A folder of one page is drawn as that page in the folder above it.
  for (const key of Object.keys(left)) {
    if (left[key] === 1 && !Object.keys(left).some((other) => other.startsWith(`${key}|`))) delete left[key];
  }
  writeFileSync(join(OUT, "counts.json"), JSON.stringify(left));
  console.log(`left out: ${Object.values(left).reduce((sum, n) => sum + n, 0)} pages in ${Object.keys(left).length} folders`);
}
