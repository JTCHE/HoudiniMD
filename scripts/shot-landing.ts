import { webkit, devices } from "playwright";
import { mkdir } from "node:fs/promises";

const outDir = process.argv[2] ?? "shots/landing";
const base = process.env.SHOT_BASE ?? "http://localhost:3000";

await mkdir(outDir, { recursive: true });
const browser = await webkit.launch();

for (const scheme of ["light", "dark"] as const) {
  const phone = await browser.newPage({ ...devices["iPhone 14 Pro"], colorScheme: scheme });
  await phone.goto(base, { waitUntil: "networkidle" });
  await phone.waitForTimeout(900);
  await phone.screenshot({ path: `${outDir}/phone-${scheme}.png`, fullPage: true });
  await phone.close();

  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  await desk.goto(base, { waitUntil: "networkidle" });
  await desk.waitForTimeout(900);
  await desk.screenshot({ path: `${outDir}/desktop-${scheme}.png` });
  await desk.close();
}

await browser.close();
console.log(`wrote ${outDir}`);
