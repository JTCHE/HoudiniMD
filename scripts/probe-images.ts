#!/usr/bin/env bun
/**
 * Fill the image-size map the build reads (lib/images/probe.ts).
 *
 * Run it after a content scrape adds pages. It reads every mirrored page,
 * collects the images they reference, and measures the ones the map does not
 * already hold. Sizes never change, so a URL is measured once and kept.
 *
 *   bun scripts/probe-images.ts              # measure what is missing, write
 *   bun scripts/probe-images.ts --dry-run    # report only
 *   bun scripts/probe-images.ts --limit 500  # stop after 500 new probes
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getConfig, getS3Client } from "../lib/r2/config";
import { parseImageDimensions } from "../lib/images/dimensions";
import { DIMENSIONS_KEY } from "../lib/images/probe";
import { VIDEO_DIMENSIONS_KEY } from "../lib/videos/probe";
import { parseWebmDimensions } from "../lib/videos/dimensions";
import { checkDocNamespace } from "../lib/url/namespaces";
import type { SearchIndexEntry } from "../lib/r2/search-index";
import { parseArgs, getNumber, c, fmtMs } from "./lib/cli";

const args = parseArgs(Bun.argv.slice(2));
const DRY_RUN = args.flags.has("dry-run");
const LIMIT = getNumber(args, "limit", 0);
// SideFX serves these one at a time for us; a build that fans out hard is what
// made the sizes unreliable in the first place. This is a background chore.
const CONCURRENCY = 12;
const PROBE_BYTES = 16 * 1024;
const PROBE_BYTES_FALLBACK = 128 * 1024;
const TIMEOUT_MS = 10_000;

const IMAGE_IN_MARKDOWN = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
// Mirrors what app/docs/[...slug]/page.tsx hands to probeVideos.
const VIDEO_IN_MARKDOWN = /<video\b[^>]*\ssrc="([^"]+)"/g;

async function prefix(url: string, bytes: number): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` }, signal: controller.signal });
    if (res.status !== 206 && res.status !== 200) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function measure(url: string): Promise<[number, number] | null> {
  let bytes = await prefix(url, PROBE_BYTES);
  let dims = bytes ? parseImageDimensions(bytes) : null;
  if (!dims && bytes && bytes[0] === 0xff && bytes[1] === 0xd8) {
    bytes = await prefix(url, PROBE_BYTES_FALLBACK);
    dims = bytes ? parseImageDimensions(bytes) : null;
  }
  return dims ? [dims.width, dims.height] : null;
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await run(items[next++]!);
    }),
  );
}

async function main() {
  const started = Date.now();
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 client unavailable");

  const index: SearchIndexEntry[] = await (await fetch(`${config.publicUrl}/content/index.json`)).json();
  const all = index.map((e) => e.path).filter((p) => checkDocNamespace(p).kind === "allowed");
  const PAGES = getNumber(args, "pages", 0);
  const pages = PAGES > 0 ? all.slice(0, PAGES) : all;
  console.log(`${c.bold(String(pages.length))} pages`);

  const urls = new Set<string>();
  const videoUrls = new Set<string>();
  let read = 0;
  // Read the pages over the public URL, not the S3 client: same bytes, no
  // signature, and it is what the site itself reads.
  await pool(pages, 32, async (path) => {
    if (++read % 2000 === 0) console.log(`  read ${read}/${pages.length}`);
    try {
      const res = await fetch(`${config.publicUrl}/content/${path}.md`);
      if (!res.ok) return;
      const markdown = await res.text();
      for (const match of markdown.matchAll(IMAGE_IN_MARKDOWN)) urls.add(match[1]!);
      for (const match of markdown.matchAll(VIDEO_IN_MARKDOWN)) {
        const src = match[1]!;
        if (src.startsWith("http") && !src.includes("vimeo.com")) videoUrls.add(src);
      }
    } catch {
      // a page the index names and the bucket does not hold: nothing to read
    }
  });


  const stored: Record<string, [number, number]> = await fetch(`${config.publicUrl}/${DIMENSIONS_KEY}`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const missing = [...urls].filter((url) => !(url in stored));
  const todo = LIMIT > 0 ? missing.slice(0, LIMIT) : missing;
  console.log(`${urls.size} images referenced, ${Object.keys(stored).length} already measured, ${todo.length} to do`);

  const write = () =>
    client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: DIMENSIONS_KEY,
        Body: JSON.stringify(stored),
        ContentType: "application/json; charset=utf-8",
      }),
    );

  let done = 0;
  let failed = 0;
  await pool(todo, CONCURRENCY, async (url) => {
    const dims = await measure(url);
    if (dims) stored[url] = dims;
    else failed++;
    // Written as it goes: the first run measures tens of thousands of images,
    // and a run that dies at 90% should not throw away what it learned.
    if (++done % 2000 === 0 && !DRY_RUN) await write();
    if (done % 250 === 0) console.log(`  measured ${done}/${todo.length}`);
  });
  console.log(`measured ${done - failed}, unreadable ${failed}`);

  if (DRY_RUN) {
    console.log(c.dim("--dry-run: nothing written"));
    return;
  }
  await write();

  // Videos get the same treatment, with the Matroska header parser. The
  // markdown carries far fewer of them, so this is a short tail on the run.
  const storedVideos: Record<string, [number, number]> = await fetch(`${config.publicUrl}/${VIDEO_DIMENSIONS_KEY}`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const videoTodo = [...videoUrls].filter((url) => !(url in storedVideos));
  console.log(`${videoUrls.size} videos referenced, ${videoTodo.length} to do`);
  let videoFailed = 0;
  await pool(videoTodo, CONCURRENCY, async (url) => {
    const bytes = await prefix(url, 64 * 1024);
    const dims = bytes ? parseWebmDimensions(bytes) : null;
    if (dims) storedVideos[url] = [dims.width, dims.height];
    else videoFailed++;
  });
  console.log(`measured ${videoTodo.length - videoFailed} videos, unreadable ${videoFailed}`);
  if (!DRY_RUN) {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: VIDEO_DIMENSIONS_KEY,
        Body: JSON.stringify(storedVideos),
        ContentType: "application/json; charset=utf-8",
      }),
    );
  }

  console.log(`${c.green("done")} ${Object.keys(stored).length} sizes in ${fmtMs(Date.now() - started)}`);
}

main().catch((err) => {
  console.error(c.red(String(err)));
  process.exit(1);
});
