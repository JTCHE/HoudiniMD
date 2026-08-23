// Regression check for the verified slug redirects in proxy.ts (VERIFIED_SLUG_REDIRECTS)
// plus a control case that must stay a real 404. Run: bun scripts/check-404-redirects.ts
const ORIGIN = process.env.URL ?? "https://houdinimd.com";

const CASES = [
  { from: "/docs/houdini/nodes/sop/sop/copytopoints", to: "/docs/houdini/nodes/sop/copytopoints" },
  { from: "/docs/houdini/nodes/top/labs--filecache-2.0", to: "/docs/houdini/nodes/top/labs--topfilecache-2.0" },
];
const UNRELATED_404 = "/docs/houdini/this-does-not-exist-anywhere";

let failed = false;

async function check(path: string, expected: number, redirect: "manual" | "follow") {
  const res = await fetch(`${ORIGIN}${path}`, { redirect });
  const ok = res.status === expected;
  console.log(`${ok ? "ok" : "FAIL"}  ${path} -> ${res.status} (expected ${expected})`);
  if (!ok) failed = true;
  return res;
}

for (const { from, to } of CASES) {
  const redirected = await check(from, 301, "manual");
  const location = redirected.headers.get("location");
  if (!location?.endsWith(to)) {
    console.log(`FAIL  ${from} redirected to "${location}", expected to end with "${to}"`);
    failed = true;
  }
  await check(to, 200, "follow");
  await check(`${from}.md`, 301, "manual");
  await check(`${to}.md`, 200, "follow");
}

await check(UNRELATED_404, 404, "follow");
await check(`${UNRELATED_404}.md`, 404, "follow");

if (failed) process.exit(1);
