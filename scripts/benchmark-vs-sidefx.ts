/**
 * Measures real page-load speed of HoudiniMD against the official SideFX docs
 * over a throttled connection, so marketing claims rest on measured numbers.
 *
 * bun scripts/benchmark-vs-sidefx.ts [--runs 5] [--profile adsl] [--headed]
 */
import { chromium, type CDPSession, type Page } from "playwright";

// Downlink/uplink are bytes per second. Latency is the one-way RTT in ms.
const PROFILES = {
	adsl: { name: "ADSL2+ (8 Mbps / 1 Mbps / 50 ms)", down: 1_000_000, up: 125_000, latency: 50 },
	"adsl-slow": { name: "ADSL (4 Mbps / 512 kbps / 60 ms)", down: 500_000, up: 64_000, latency: 60 },
	cable: { name: "Cable (50 Mbps / 10 Mbps / 20 ms)", down: 6_250_000, up: 1_250_000, latency: 20 },
	none: { name: "Unthrottled", down: -1, up: -1, latency: 0 },
} as const;

// Matched content pairs — the same doc page on each site.
const PAGES = [
	{ label: "Box", sidefx: "nodes/sop/box.html", houdinimd: "nodes/sop/box" },
	{ label: "Copy to Points", sidefx: "nodes/sop/copytopoints.html", houdinimd: "nodes/sop/copytopoints" },
	{ label: "Attribute Wrangle", sidefx: "nodes/sop/attribwrangle.html", houdinimd: "nodes/sop/attribwrangle" },
	{ label: "POP Force", sidefx: "nodes/dop/popforce.html", houdinimd: "nodes/dop/popforce" },
	{ label: "VEX noise()", sidefx: "vex/functions/noise.html", houdinimd: "vex/functions/noise" },
];

const SIDEFX = "https://www.sidefx.com/docs/houdini/";
const HOUDINIMD = "https://houdinimd.jchd.me/docs/houdini/";

type Sample = { ttfb: number; dcl: number; load: number; lcp: number; bytes: number; requests: number };

const arg = (flag: string, fallback: string) => {
	const i = process.argv.indexOf(flag);
	return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

async function measure(page: Page, cdp: CDPSession, url: string, p: (typeof PROFILES)[keyof typeof PROFILES]): Promise<Sample> {
	await cdp.send("Network.enable");
	await cdp.send("Network.clearBrowserCache");
	await cdp.send("Network.emulateNetworkConditions", {
		offline: false,
		downloadThroughput: p.down,
		uploadThroughput: p.up,
		latency: p.latency,
	});

	// Real bytes on the wire, from the network layer — content-length headers lie
	// (missing on chunked responses, pre-compression on others).
	let bytes = 0;
	let requests = 0;
	const onFinished = (e: { encodedDataLength: number }) => {
		requests++;
		bytes += e.encodedDataLength ?? 0;
	};
	cdp.on("Network.loadingFinished", onFinished);

	// LCP only reports through a PerformanceObserver, and it must be registered
	// before any content paints — hence addInitScript, not evaluate-after-load.
	await page.addInitScript(() => {
		(window as unknown as { __lcp: number }).__lcp = 0;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				(window as unknown as { __lcp: number }).__lcp = entry.startTime;
			}
		}).observe({ type: "largest-contentful-paint", buffered: true });
	});

	await page.goto(url, { waitUntil: "load", timeout: 120_000 });
	// Let late LCP candidates (hero images, late-hydrated text) settle.
	await page.waitForTimeout(2500);

	const timings = await page.evaluate(() => {
		const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
		return {
			ttfb: nav.responseStart - nav.startTime,
			dcl: nav.domContentLoadedEventEnd - nav.startTime,
			load: nav.loadEventEnd - nav.startTime,
			lcp: (window as unknown as { __lcp: number }).__lcp || 0,
		};
	});

	cdp.off("Network.loadingFinished", onFinished);
	return { ...timings, bytes, requests };
}

async function main() {
	const runs = Number(arg("--runs", "5"));
	const profileKey = arg("--profile", "adsl") as keyof typeof PROFILES;
	const profile = PROFILES[profileKey];
	if (!profile) throw new Error(`Unknown profile "${profileKey}". Use: ${Object.keys(PROFILES).join(", ")}`);

	const headed = process.argv.includes("--headed");
	console.log(`\nProfile : ${profile.name}`);
	console.log(`Runs    : ${runs} per page (cold cache each run, median reported)`);
	console.log(`Mode    : ${headed ? "headed" : "headless"}\n`);

	const browser = await chromium.launch({ headless: !headed });
	const results: { label: string; site: string; s: Record<keyof Sample, number> }[] = [];

	for (const pageDef of PAGES) {
		for (const [site, base, path] of [
			["SideFX", SIDEFX, pageDef.sidefx],
			["HoudiniMD", HOUDINIMD, pageDef.houdinimd],
		] as const) {
			const samples: Sample[] = [];
			for (let i = 0; i < runs; i++) {
				// Fresh context per run = cold cache, cold storage, no carry-over.
				const ctx = await browser.newContext();
				const page = await ctx.newPage();
				const cdp = await ctx.newCDPSession(page);
				try {
					samples.push(await measure(page, cdp, base + path, profile));
					process.stdout.write(".");
				} catch (e) {
					process.stdout.write("x");
				}
				await ctx.close();
			}
			if (samples.length) {
				results.push({
					label: pageDef.label,
					site,
					s: {
						ttfb: median(samples.map((x) => x.ttfb)),
						dcl: median(samples.map((x) => x.dcl)),
						load: median(samples.map((x) => x.load)),
						lcp: median(samples.map((x) => x.lcp)),
						bytes: median(samples.map((x) => x.bytes)),
						requests: median(samples.map((x) => x.requests)),
					},
				});
			}
			console.log(`  ${site.padEnd(10)} ${pageDef.label}`);
		}
	}

	await browser.close();

	const ms = (n: number) => `${(n / 1000).toFixed(2)}s`;
	const kb = (n: number) => `${Math.round(n / 1024)} KB`;

	console.log(`\n${"".padEnd(78, "─")}`);
	console.log(`${"Page".padEnd(20)}${"Site".padEnd(12)}${"LCP".padEnd(10)}${"Load".padEnd(10)}${"TTFB".padEnd(10)}${"Weight".padEnd(10)}Reqs`);
	console.log("".padEnd(78, "─"));
	for (const r of results) {
		console.log(
			r.label.padEnd(20) +
				r.site.padEnd(12) +
				ms(r.s.lcp).padEnd(10) +
				ms(r.s.load).padEnd(10) +
				ms(r.s.ttfb).padEnd(10) +
				kb(r.s.bytes).padEnd(10) +
				String(Math.round(r.s.requests)),
		);
	}
	console.log("".padEnd(78, "─"));

	const agg = (site: string, key: keyof Sample) => median(results.filter((r) => r.site === site).map((r) => r.s[key]));
	const speedup = (key: keyof Sample) => (agg("SideFX", key) / agg("HoudiniMD", key)).toFixed(1);

	console.log(`\nMedian across all pages — ${profile.name}\n`);
	for (const [key, label] of [
		["lcp", "Largest Contentful Paint"],
		["load", "Full page load"],
		["ttfb", "Time to first byte"],
	] as const) {
		console.log(`  ${label.padEnd(26)} SideFX ${ms(agg("SideFX", key)).padStart(7)}   HoudiniMD ${ms(agg("HoudiniMD", key)).padStart(7)}   → ${speedup(key)}× faster`);
	}
	console.log(
		`  ${"Page weight".padEnd(26)} SideFX ${kb(agg("SideFX", "bytes")).padStart(7)}   HoudiniMD ${kb(agg("HoudiniMD", "bytes")).padStart(7)}   → ${(agg("SideFX", "bytes") / agg("HoudiniMD", "bytes")).toFixed(1)}× lighter`,
	);
	console.log("\nUse the LCP multiplier for marketing — it is when the page becomes readable.\n");
}

main();
