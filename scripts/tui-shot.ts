/**
 * Screenshot scripts/analytics.ts as a PNG, so the terminal dashboard's design
 * can be iterated on visually instead of by eyeballing raw ANSI text.
 *
 *   node scripts/tui-shot.ts [outDir]
 *
 * Node, not bun: bun on Windows cannot hold Playwright's stdio pipe (see
 * webkit-shot.ts). Captures one frame of analytics.ts with FORCE_COLOR=1
 * (colours survive being piped) and a fixed --width (no real TTY to size
 * against), converts the ANSI it printed to HTML, and screenshots that.
 */
import { webkit } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const outDir = process.argv[2] ?? "shots";
const width = process.argv[3] ?? "130";
const height = process.argv[4] ?? "38";
await mkdir(outDir, { recursive: true });

const res = spawnSync("bun", ["scripts/analytics.ts", "--once", `--width=${width}`, `--height=${height}`, "--keep-mine"], {
  env: { ...process.env, FORCE_COLOR: "1" },
  encoding: "utf8",
});
if (res.status !== 0) {
  console.error(res.stderr || res.error);
  process.exit(1);
}

const SGR_STYLE: Record<string, string> = {
  "1": "font-weight:600",
  "2": "opacity:0.5",
  "31": "color:#ff6b81",
  "32": "color:#4ade80",
  "33": "color:#fbbf24",
  "34": "color:#60a5fa",
  "35": "color:#e879f9",
  "36": "color:#22d3ee",
};

/** `38;2;r;g;b` (24-bit foreground) — the whole analytics palette uses it. */
function sgrToCss(codes: string): string {
  const parts = codes.split(";");
  if (parts[0] === "38" && parts[1] === "2") return `color:rgb(${parts[2]},${parts[3]},${parts[4]})`;
  return parts.map((code) => SGR_STYLE[code]).filter(Boolean).join(";");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Parses `\x1b[<codes>m` SGR sequences into nested <span>s; `0` closes all. */
function ansiToHtml(raw: string): string {
  const parts = raw.split(/\x1b\[([0-9;]*)m/);
  let open = 0;
  let html = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      html += escapeHtml(parts[i]);
      continue;
    }
    if (parts[i] === "" || parts[i] === "0") {
      html += "</span>".repeat(open);
      open = 0;
    } else {
      html += `<span style="${sgrToCss(parts[i])}">`;
      open++;
    }
  }
  return html + "</span>".repeat(open);
}

const html = `<!doctype html>
<html><body style="margin:0;background:#0b1017;">
<pre id="tui" style="display:inline-block;margin:0;padding:24px;color:#c6d3e8;
  background:#0b1017;font-family:'Cascadia Code','JetBrains Mono',Consolas,monospace;
  font-size:14px;line-height:1.4;white-space:pre;">${ansiToHtml(res.stdout)}</pre>
</body></html>`;

await writeFile(`${outDir}/tui.html`, html);

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.setContent(html);
await page.locator("#tui").screenshot({ path: `${outDir}/tui.png` });
await browser.close();
console.log(`wrote ${outDir}/tui.png`);
