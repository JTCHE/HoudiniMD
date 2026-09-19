#!/usr/bin/env bun
/**
 * Draw every page's social card here, not on the Worker.
 *
 * A card costs about 1.2 CPU-s to draw and `caches.default` is per colo, so a
 * crawl of the whole mirror would spend roughly 14.8M Worker CPU-ms — half a
 * month's included CPU — on images no reader looks at. The same card takes
 * ~40ms on this machine. So draw them all here and put them in R2, where
 * lib/stored-answer.ts already serves them before Next starts.
 *
 * The query string is the card's whole input and, hashed, its key. It is built
 * by lib/og/params.ts — the same function `generateMetadata` uses — so what is
 * drawn here is what every page asks for, from one source of truth.
 *
 *   bun scripts/prerender-og.ts              # draw what is missing, write
 *   bun scripts/prerender-og.ts --dry-run    # report only
 *   bun scripts/prerender-og.ts --limit 500  # stop after 500 cards
 */
import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import { buildOgImageJsx } from "../lib/og/og-image";
import { SITE_URL } from "../lib/site";
import { META_ALL_PATH } from "../lib/meta-all";
import { pageMeta, ogParams } from "../lib/og/params";
import { getConfig } from "../lib/r2/config";
import { parseArgs, getNumber, c, fmtMs } from "./lib/cli";

const args = parseArgs(Bun.argv.slice(2));
const DRY_RUN = args.flags.has("dry-run");
const LIMIT = getNumber(args, "limit", 0);
const READ_CONCURRENCY = 32;
const PUT_CONCURRENCY = 12;
// The icons come from the site itself, which rate-limits; the markdown does not.
const ICON_CONCURRENCY = 8;
const BUCKET = "houdinimd-cache";
const OG_PREFIX = "og/";

function client(): S3Client {
  const { CF_ACCOUNT_ID, R2_CACHE_ACCESS_KEY_ID, R2_CACHE_SECRET_ACCESS_KEY } = process.env;
  if (!CF_ACCOUNT_ID || !R2_CACHE_ACCESS_KEY_ID || !R2_CACHE_SECRET_ACCESS_KEY) {
    throw new Error("CF_ACCOUNT_ID, R2_CACHE_ACCESS_KEY_ID and R2_CACHE_SECRET_ACCESS_KEY must be set.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_CACHE_ACCESS_KEY_ID, secretAccessKey: R2_CACHE_SECRET_ACCESS_KEY },
  });
}

async function listKeys(s3: S3Client, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Run `work` over `items`, `limit` at a time. */
async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

/**
 * Every mirrored page, from the title map the deploy writes. The `/index`
 * aliases in it name the same page twice, so drop them.
 */
async function docPaths(): Promise<string[]> {
  const res = await realFetch(`${SITE_URL}${META_ALL_PATH}`);
  if (!res.ok) throw new Error(`${META_ALL_PATH} answered ${res.status}`);
  const meta = (await res.json()) as Record<string, unknown>;
  return Object.keys(meta).filter((path) => !path.endsWith("/index"));
}

/**
 * The `/api/og` query a page publishes, read from the page's own markdown by
 * the same function `generateMetadata` uses. The mirrored markdown is on the
 * bucket's public host, so reading 12k pages costs the Worker nothing and does
 * not trip the site's own rate limit.
 */
async function ogQuery(publicUrl: string, path: string): Promise<string | null> {
  const res = await realFetch(`${publicUrl}/content/${path}.md`);
  if (!res.ok) return null;
  const fallbackTitle = path.split("/").at(-1)?.replace(/-/g, " ") ?? "SideFX documentation";
  return ogParams(path, pageMeta(await res.text(), fallbackTitle)).toString();
}

const fonts = ([300, 500, 900] as const).map((weight) => ({
  name: "Geist",
  data: readFileSync(`public/fonts/geist/Geist-${{ 300: "Light", 500: "Medium", 900: "Black" }[weight]}.ttf`),
  weight,
  style: "normal" as const,
}));

/**
 * satori fetches the logo by URL. Hold it in memory and answer from there:
 * 11k renders would otherwise be 11k requests for the same file, and a miss
 * silently leaves a hole in the card.
 */
const assets = new Map<string, Response>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const held = assets.get(url);
  if (held) return held.clone();
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;

async function hold(url: string): Promise<boolean> {
  if (assets.has(url)) return true;
  try {
    const res = await realFetch(url);
    if (!res.ok) return false;
    const body = await res.arrayBuffer();
    assets.set(url, new Response(body, { headers: { "content-type": res.headers.get("content-type") ?? "" } }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirrors app/api/og/route.tsx: satori rejects an SVG with no `viewBox`
 * without throwing, and paints a blank square that still takes the space.
 */
function withViewBox(svg: string): string | undefined {
  const root = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!root) return undefined;
  if (/\bviewBox=/.test(root)) return svg;
  const size = (attr: string) => Number.parseFloat(root.match(new RegExp(`\\b${attr}="([\\d.]+)`))?.[1] ?? "");
  const [width, height] = [size("width"), size("height")];
  if (!width || !height) return undefined;
  return svg.replace(root, root.replace(/^<svg\b/, `<svg viewBox="0 0 ${width} ${height}"`));
}

function toBase64(text: string): string {
  let latin1 = "";
  for (const byte of new TextEncoder().encode(text)) latin1 += String.fromCharCode(byte);
  return btoa(latin1);
}

async function resolveIcon(icon: string): Promise<string | undefined> {
  const url = icon.startsWith("/") ? `${SITE_URL}${icon}` : icon;
  try {
    const res = await realFetch(url);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !(type.includes("svg") || type.startsWith("image/"))) return undefined;
    if (!type.includes("svg")) return icon;
    const svg = withViewBox(await res.text());
    return svg && `data:image/svg+xml;base64,${toBase64(svg)}`;
  } catch {
    return undefined;
  }
}

async function main() {
  const started = Date.now();
  const s3 = client();

  const publicUrl = getConfig()?.publicUrl;
  if (!publicUrl) throw new Error("R2_PUBLIC_URL must be set.");

  const [paths, ogKeys] = await Promise.all([docPaths(), listKeys(s3, OG_PREFIX)]);
  const drawn = new Set(ogKeys);
  console.log(`  ${paths.length} pages, ${drawn.size} cards already drawn`);

  console.log(c.dim("  reading what each page says about itself…"));
  const wanted = new Map<string, string>(); // og key -> query
  let noCard = 0;
  let read = 0;
  await pool(paths, READ_CONCURRENCY, async (path) => {
    try {
      const query = await ogQuery(publicUrl, path);
      if (!query) {
        noCard++;
        return;
      }
      wanted.set(`${OG_PREFIX}${await sha256Hex(query)}.png`, query);
    } catch {
      noCard++;
    } finally {
      if (++read % 2000 === 0) console.log(c.dim(`    ${read}/${paths.length} read`));
    }
  });
  console.log(`  ${wanted.size} distinct cards, ${noCard} pages with none`);

  const hit = [...wanted.keys()].filter((key) => drawn.has(key)).length;
  console.log(`  ${hit} of the ${drawn.size} stored cards match a published page`);

  let todo = [...wanted].filter(([key]) => !drawn.has(key));
  if (LIMIT && todo.length > LIMIT) todo = todo.slice(0, LIMIT);
  console.log(`  ${c.bold(String(todo.length))} to draw`);
  if (!todo.length || DRY_RUN) {
    if (DRY_RUN) console.log(c.dim("  --dry-run: nothing written"));
    return;
  }

  console.log(c.dim("  holding the logo and the node icons…"));
  const icons = new Set<string>();
  for (const [, query] of todo) {
    const icon = new URLSearchParams(query).get("icon");
    if (icon) icons.add(icon);
  }
  await hold(`${SITE_URL}/icon.svg`);
  const resolved = new Map<string, string | undefined>();
  await pool([...icons], ICON_CONCURRENCY, async (icon) => {
    resolved.set(icon, await resolveIcon(icon));
  });
  console.log(`  ${assets.size} held, ${[...resolved.values()].filter(Boolean).length} of ${icons.size} icons usable`);

  let drawnNow = 0;
  let failed = 0;
  const pending: { key: string; body: Uint8Array }[] = [];

  const flush = async () => {
    const batch = pending.splice(0);
    if (DRY_RUN || !batch.length) return;
    await pool(batch, PUT_CONCURRENCY, async ({ key, body }) => {
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: "image/png" }));
    });
  };

  for (const [key, query] of todo) {
    const params = new URLSearchParams(query);
    const iconParam = params.get("icon");
    try {
      const response = new ImageResponse(
        buildOgImageJsx({
          title: params.get("title") ?? "HoudiniMD",
          nodeType: params.get("type") || undefined,
          summary: params.get("summary") || undefined,
          category: params.get("category") || undefined,
          icon: iconParam ? resolved.get(iconParam) : undefined,
        }),
        { width: 1200, height: 630, fonts: fonts as never },
      );
      pending.push({ key, body: new Uint8Array(await response.arrayBuffer()) });
      drawnNow++;
    } catch {
      failed++;
    }
    if (pending.length >= 200) {
      await flush();
      console.log(c.dim(`  ${drawnNow}/${todo.length} drawn (${fmtMs(Date.now() - started)})`));
    }
  }
  await flush();

  console.log(`  ${c.bold(String(drawnNow))} cards written, ${failed} failed, ${fmtMs(Date.now() - started)}`);
}

await main();
