#!/usr/bin/env bun
/**
 * Skip-if-unchanged sync of the OpenNext incremental cache to the R2 cache
 * bucket (`houdinimd-cache`), plus orphan pruning.
 *
 * Replaces OpenNext's built-in deploy populate step, which PUTs every one of
 * the ~21k cache assets unconditionally on every deploy (~21k R2 Class A ops)
 * and never deletes stale entries. With a pinned BUILD_ID (see next.config.ts)
 * the cache keys are stable across deploys, so here we:
 *   1. List what's already in R2 (bulk, ~22 Class A "list" ops for the whole
 *      bucket — far cheaper than per-object HEADs).
 *   2. Upload ONLY assets whose content differs (R2 etag = md5 of the stored
 *      bytes; we compare it to the local file's md5). A content-stable deploy
 *      uploads nothing.
 *   3. Delete orphans — any object under the prefix that no current asset maps
 *      to. This reclaims old random-build-id prefixes and removed pages.
 *
 * The keys are computed identically to OpenNext's runtime R2 cache
 * (`computeCacheKey`: `${prefix}/${buildId}/${sha256(key)}.${cacheType}`), so
 * the worker reads exactly what this writes.
 *
 * Auth: a dedicated R2 token scoped to the cache bucket, via env
 *   R2_CACHE_ACCESS_KEY_ID / R2_CACHE_SECRET_ACCESS_KEY
 * (the existing R2_ACCESS_KEY_ID is scoped to the docs bucket only). The
 * account id / endpoint is shared (R2_ACCOUNT_ID). These are only needed
 * locally at deploy time — the deployed worker uses the R2 binding, not S3.
 *
 * Usage:
 *   bun scripts/cache-sync.ts            # dry-run: report uploads/deletes
 *   bun scripts/cache-sync.ts --apply    # perform uploads + deletes
 *   bun scripts/cache-sync.ts --apply --no-prune   # upload only, keep orphans
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { parseArgs, c, fmtPct } from "./lib/cli";

const BUCKET = "houdinimd-cache";
const CACHE_DIR = path.join(process.cwd(), ".open-next", "cache");
// Must match the runtime: OpenNext defaults the prefix to "incremental-cache"
// when NEXT_INC_CACHE_R2_PREFIX is unset (it is unset here).
const PREFIX = process.env.NEXT_INC_CACHE_R2_PREFIX || "incremental-cache";
const CONCURRENCY = 32;

interface CacheAsset {
  fullPath: string;
  /** R2 object key, identical to what the runtime computes. */
  key: string;
  kind: "cache" | "fetch";
}

/** Mirror of OpenNext's computeCacheKey. */
function computeCacheKey(
  key: string,
  cacheType: "cache" | "fetch",
  buildId: string,
): string {
  const hash = createHash("sha256").update(key).digest("hex");
  return `${PREFIX}/${buildId}/${hash}.${cacheType}`.replace(/\/+/g, "/");
}

/**
 * Enumerate local cache assets, mirroring OpenNext's getCacheAssets path
 * parsing so the derived keys match the runtime exactly.
 */
function collectAssets(): CacheAsset[] {
  let entries: string[];
  try {
    entries = readdirSync(CACHE_DIR, { recursive: true, encoding: "utf8" });
  } catch {
    throw new Error(
      `Cache dir not found at ${CACHE_DIR}. Run \`opennextjs-cloudflare build\` first.`,
    );
  }
  const assets: CacheAsset[] = [];
  for (const rel of entries) {
    const fullPath = path.join(CACHE_DIR, rel);
    const relPath = rel.split(path.sep).join("/");
    if (relPath.startsWith("__fetch/")) {
      const [, buildId, ...keyParts] = relPath.split("/");
      if (!buildId || keyParts.length === 0) continue; // dir entry / malformed
      assets.push({
        fullPath,
        key: computeCacheKey(`/${keyParts.join("/")}`, "fetch", buildId),
        kind: "fetch",
      });
    } else if (relPath.endsWith(".cache")) {
      const [buildId, ...keyParts] = relPath.slice(0, -".cache".length).split("/");
      if (!buildId || keyParts.length === 0) continue;
      assets.push({
        fullPath,
        key: computeCacheKey(`/${keyParts.join("/")}`, "cache", buildId),
        kind: "cache",
      });
    }
    // everything else (directories) is skipped
  }
  return assets;
}

function md5(buf: Buffer): string {
  return createHash("md5").update(buf).digest("hex");
}

// A .fetch entry is a whole HTTP response from the docs origin, response
// headers included. Some of those headers change on every request (`date`,
// `cf-ray`, ...), so byte-identical markdown produced a different object each
// build and re-uploaded all ~11k .fetch entries — half the PUTs of a deploy,
// for no content change. Drop the volatile ones and sort the rest, so the
// stored bytes depend only on the response body. Next only reads the headers
// it cares about (content-type, etag, cache-control), all of which stay.
const VOLATILE_FETCH_HEADERS = new Set([
  "age",
  "alt-svc",
  "cf-cache-status",
  "cf-ray",
  "date",
  "nel",
  "report-to",
  "server-timing",
  "x-request-id",
]);

/** Bytes to store for an asset: .fetch entries normalised, everything else raw. */
function bodyFor(a: CacheAsset): Buffer {
  const raw = readFileSync(a.fullPath);
  if (a.kind !== "fetch") return raw;
  try {
    const entry = JSON.parse(raw.toString("utf8"));
    const headers = entry?.data?.headers;
    if (!headers || typeof headers !== "object") return raw;
    entry.data.headers = Object.fromEntries(
      Object.entries(headers)
        .filter(([k]) => !VOLATILE_FETCH_HEADERS.has(k.toLowerCase()))
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)),
    );
    return Buffer.from(JSON.stringify(entry));
  } catch {
    return raw; // not the shape we expect — store it untouched
  }
}

function makeClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_CACHE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_CACHE_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 cache credentials. Set R2_ACCOUNT_ID, R2_CACHE_ACCESS_KEY_ID, " +
        "R2_CACHE_SECRET_ACCESS_KEY (cache-bucket-scoped token) in .env.local.",
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** List every object under a prefix, returning key -> etag (md5, unquoted). */
async function listRemote(client: S3Client, prefix: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let token: string | undefined;
  let calls = 0;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    calls++;
    for (const o of res.Contents ?? []) {
      if (o.Key) map.set(o.Key, (o.ETag ?? "").replace(/"/g, ""));
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  console.log(c.dim(`  listed ${map.size} remote objects in ${calls} list call(s)`));
  return map;
}

// --- static chunk archive (P1 defense-in-depth against deleted-chunk 404s) ---
// Content-hashed /_next/static/{chunks,css,media} files, archived under
// static-archive/ so worker.ts can serve old-deploy chunks that a
// still-being-revalidated stale HTML/RSC response references but Workers
// Assets (current-deploy-only) no longer has. Immutable filenames — existence
// check is enough, no etag diff or pruning needed (see worker.ts).
const STATIC_ASSETS_DIR = path.join(process.cwd(), ".open-next", "assets", "_next", "static");
const STATIC_ARCHIVE_PREFIX = "static-archive/_next/static";
const STATIC_ARCHIVE_SUBDIRS = ["chunks", "css", "media"];

interface StaticAsset {
  fullPath: string;
  key: string;
}

function collectStaticAssets(): StaticAsset[] {
  const assets: StaticAsset[] = [];
  for (const sub of STATIC_ARCHIVE_SUBDIRS) {
    const dir = path.join(STATIC_ASSETS_DIR, sub);
    let entries: string[];
    try {
      entries = readdirSync(dir, { recursive: true, encoding: "utf8" });
    } catch {
      continue; // subdir may not exist for every build
    }
    for (const rel of entries) {
      const fullPath = path.join(dir, rel);
      if (!statSync(fullPath).isFile()) continue;
      const relPath = rel.split(path.sep).join("/");
      assets.push({ fullPath, key: `${STATIC_ARCHIVE_PREFIX}/${sub}/${relPath}` });
    }
  }
  return assets;
}

async function syncStaticArchive(client: S3Client) {
  console.log("");
  console.log(c.bold("Static chunk archive"));
  const assets = collectStaticAssets();
  console.log(`  local assets ${assets.length}`);
  const remote = await listRemote(client, `${STATIC_ARCHIVE_PREFIX}/`);
  const toUpload = assets.filter((a) => !remote.has(a.key));
  console.log(`  ${c.green("upload")}  ${toUpload.length} / ${assets.length} new (content-hashed, existing ones are immutable)`);
  let uploaded = 0;
  await pool(toUpload, CONCURRENCY, async (a) => {
    await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: a.key, Body: readFileSync(a.fullPath) }));
    uploaded++;
  });
  console.log(`  archived ${uploaded}/${toUpload.length}`);
}

/** Run async tasks with bounded concurrency. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.flags.has("apply");
  const prune = !args.flags.has("no-prune");

  console.log(c.bold("HoudiniMD cache sync"));
  console.log(`  bucket      ${BUCKET}`);
  console.log(`  prefix      ${PREFIX}/`);
  console.log(`  mode        ${apply ? c.red("--apply (writes to R2)") : c.dim("dry-run (pass --apply to commit)")}`);
  console.log(`  prune       ${prune ? "on" : c.yellow("off (--no-prune)")}`);
  console.log("");

  const client = makeClient();
  const assets = collectAssets();
  console.log(`  local assets ${assets.length}`);
  const remote = await listRemote(client, `${PREFIX}/`);

  // Diff. An asset needs upload if remote is missing it or the etag differs.
  // (A multipart etag contains "-"; our objects are single-part, so any "-"
  // forces a re-upload, which is safe.)
  const valid = new Set<string>();
  const toUpload: CacheAsset[] = [];
  for (const a of assets) {
    valid.add(a.key);
    const remoteEtag = remote.get(a.key);
    const localEtag = md5(bodyFor(a));
    if (remoteEtag !== localEtag) toUpload.push(a);
  }
  const toDelete = prune
    ? [...remote.keys()].filter((k) => !valid.has(k))
    : [];

  console.log("");
  console.log(`  ${c.green("upload")}  ${toUpload.length} / ${assets.length} (${fmtPct(toUpload.length, assets.length)} changed)`);
  console.log(`  ${c.red("delete")}  ${toDelete.length} orphan(s)`);

  if (!apply) {
    console.log("");
    console.log(c.dim("  dry-run — nothing written. Re-run with --apply to commit."));
    if (toDelete.length) {
      console.log(c.dim("  sample orphan keys:"));
      toDelete.slice(0, 5).forEach((k) => console.log(c.dim(`    ${k}`)));
    }
    return;
  }

  // Archive the new build's chunks FIRST. The cache upload below overwrites the
  // live cache in place (pinned BUILD_ID), so the still-live previous deploy
  // starts serving the new pages ~10 minutes before `wrangler deploy` publishes
  // the chunks they reference. Until then only this archive can serve them.
  await syncStaticArchive(client);

  // Uploads
  const UPLOAD_RETRIES = 3;
  let uploaded = 0;
  let failed = 0;
  await pool(toUpload, CONCURRENCY, async (a) => {
    const body = bodyFor(a); // must match the diff above, or every deploy re-uploads
    for (let attempt = 1; attempt <= UPLOAD_RETRIES; attempt++) {
      try {
        await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: a.key, Body: body }));
        if (++uploaded % 1000 === 0) console.log(c.dim(`    uploaded ${uploaded}/${toUpload.length}`));
        return;
      } catch (e) {
        // Under CONCURRENCY parallel uploads, large bodies are the most likely
        // to hit a transient socket/timeout error — retry before giving up.
        if (attempt === UPLOAD_RETRIES) {
          failed++;
          console.error(c.red(`    upload failed ${a.key} (${body.length}B): ${e instanceof Error ? e.message : e}`));
        } else {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
  });
  console.log(`  uploaded ${uploaded}/${toUpload.length}${failed ? c.red(` (${failed} failed)`) : ""}`);

  // Deletes (DeleteObjects handles up to 1000 keys per request)
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    deleted += batch.length;
    console.log(c.dim(`    deleted ${deleted}/${toDelete.length}`));
  }

  console.log("");
  console.log(c.bold(`Done. ${uploaded} uploaded, ${deleted} deleted.`));
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(c.red(e instanceof Error ? e.stack ?? e.message : String(e)));
  process.exit(1);
});
