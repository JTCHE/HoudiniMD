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
 * `--titles` reads the page titles from the app running on this machine
 * (`http://localhost:<APP_PORT>`). Only the path, title, node type and folder
 * of each page are kept: no summary, no text, no icon.
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

if (process.argv.includes("--titles")) {
  const all = (await fetch(`http://localhost:${APP_PORT}/api/titles`).then((answer) => answer.json())) as {
    path: string;
    title: string;
    nodeType?: string | null;
    place?: string[];
  }[];
  const kept = all.map(({ path, title, nodeType, place }) => ({
    path,
    title,
    nodeType: nodeType ?? undefined,
    place: place?.length ? place : undefined,
  }));
  writeFileSync(join(OUT, "titles.json"), JSON.stringify(kept));
  console.log(`titles: ${kept.length}`);
}
