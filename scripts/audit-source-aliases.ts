#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  equivalentMarkdownArtifacts,
  scrapeSideFXPage,
  sourceFingerprint,
  PageNotFoundError,
  resolveSideFXUrl,
} from "../lib/scraping";
import { convertToMarkdown, detectLanguage } from "../lib/markdown";
import { getConfig, getS3Client } from "../lib/r2/config";
import { fetchSearchIndex, listR2Slugs, regenerateBatch } from "./lib/regen";
import { LITE_INDEX_PATH, mutateSearchIndex, type SearchIndexEntry } from "../lib/r2/search-index";
import type { SourceAlias } from "../lib/source-aliases";

const ALIAS_ROOT = "metadata/source-aliases";
const IDENTITY_ROOT = "metadata/source-identities";
const CACHE_BUCKET = "houdinimd-cache";
const CACHE_PREFIX = process.env.NEXT_INC_CACHE_R2_PREFIX || "incremental-cache";
const BUILD_ID = "houdinimd";

type AuditReason = "verified" | "parent-missing" | "source-mismatch" | "artifact-mismatch" | "fetch-error";
interface AuditResult {
  alias: string;
  canonical?: string;
  aliasFingerprint?: string;
  canonicalFingerprint?: string;
  reason: AuditReason;
  error?: string;
  canonicalMarkdown?: string;
  canonicalEntry?: SearchIndexEntry;
}

async function putJson(key: string, value: unknown): Promise<void> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 is not configured");
  await client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: JSON.stringify(value),
    ContentType: "application/json; charset=utf-8",
  }));
}

async function putMarkdown(key: string, markdown: string): Promise<void> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 is not configured");
  await client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: markdown,
    ContentType: "text/markdown; charset=utf-8",
  }));
}

async function getJson<T>(key: string): Promise<T | null> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 is not configured");
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }));
    return response.Body ? JSON.parse(await response.Body.transformToString("utf-8")) : null;
  } catch (error: unknown) {
    const status = typeof error === "object" && error && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
    if (status === 404 || (error instanceof Error && error.name === "NoSuchKey")) return null;
    throw error;
  }
}

async function backUpObjects(keys: string[]): Promise<string> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 is not configured");
  const backupPrefix = `backups/source-aliases/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const copied: string[] = [];
  const missing: string[] = [];

  for (const key of [...new Set(keys)].sort()) {
    try {
      const source = await client.send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }));
      if (!source.Body) throw new Error(`Empty body for ${key}`);
      const body = await source.Body.transformToByteArray();
      await client.send(new PutObjectCommand({
        Bucket: config.bucketName,
        Key: `${backupPrefix}/${key}`,
        Body: body,
        ContentType: source.ContentType,
      }));
      copied.push(key);
    } catch (error: unknown) {
      const status = typeof error === "object" && error && "$metadata" in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
      if (status === 404 || (error instanceof Error && error.name === "NoSuchKey")) missing.push(key);
      else throw error;
    }
  }

  await putJson(`${backupPrefix}/manifest.json`, { createdAt: new Date().toISOString(), copied, missing });
  const manifest = await getJson<{ copied: string[] }>(`${backupPrefix}/manifest.json`);
  if (!manifest || manifest.copied.length !== copied.length) throw new Error("Backup manifest verification failed");
  console.log(`\nBackup complete: ${backupPrefix} (${copied.length} objects)`);
  return backupPrefix;
}

async function listStoredAliases(): Promise<string[]> {
  return (await listKeys(`${ALIAS_ROOT}/`))
    .filter((key) => key.endsWith(".json"))
    .map((key) => key.slice(ALIAS_ROOT.length + 1, -".json".length));
}

async function listKeys(prefix: string): Promise<string[]> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 is not configured");
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: config.bucketName,
      Prefix: prefix,
      ContinuationToken: token,
    }));
    for (const object of response.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    token = response.NextContinuationToken;
  } while (token);
  return keys;
}

function batches<T>(values: T[], size = 1000): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size));
  return result;
}

async function deleteVerifiedMarkdown(aliases: string[]): Promise<void> {
  if (!aliases.length) return;
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 is not configured");
  for (const batch of batches(aliases)) {
    const response = await client.send(new DeleteObjectsCommand({
      Bucket: config.bucketName,
      Delete: { Objects: batch.map((alias) => ({ Key: `content/${alias}.md` })) },
    }));
    if (response.Errors?.length) throw new Error(`Could not delete ${response.Errors.length} duplicate Markdown object(s)`);
  }
}

async function deleteAliasMappings(aliases: string[]): Promise<void> {
  if (!aliases.length) return;
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error("R2 is not configured");
  for (const batch of batches(aliases)) {
    const response = await client.send(new DeleteObjectsCommand({
      Bucket: config.bucketName,
      Delete: { Objects: batch.map((alias) => ({ Key: `${ALIAS_ROOT}/${alias}.json` })) },
    }));
    if (response.Errors?.length) throw new Error(`Could not delete ${response.Errors.length} invalid alias mapping(s)`);
  }
}

function cacheKey(path: string): string {
  const hash = createHash("sha256").update(path).digest("hex");
  return `${CACHE_PREFIX}/${BUILD_ID}/${hash}.cache`;
}

async function deleteAliasIsr(aliases: string[]): Promise<void> {
  if (!aliases.length) return;
  const config = getConfig();
  const accessKeyId = process.env.R2_CACHE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_CACHE_SECRET_ACCESS_KEY;
  if (!config || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 cache credentials are required to remove alias ISR entries");
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  const cachePaths = [...aliases.map((alias) => `/docs/${alias}`), "/sitemap.xml"];
  for (const batch of batches(cachePaths)) {
    const response = await client.send(new DeleteObjectsCommand({
      Bucket: CACHE_BUCKET,
      Delete: { Objects: batch.map((path) => ({ Key: cacheKey(path) })) },
    }));
    if (response.Errors?.length) throw new Error(`Could not delete ${response.Errors.length} alias ISR object(s)`);
  }
}

async function audit(alias: string): Promise<AuditResult> {
  const canonical = alias.slice(0, -"/index".length);
  try {
    const aliasSource = await scrapeSideFXPage(await resolveSideFXUrl(alias));
    const aliasFingerprint = await sourceFingerprint(aliasSource);
    try {
      const canonicalSource = await scrapeSideFXPage(await resolveSideFXUrl(canonical));
      const canonicalFingerprint = await sourceFingerprint(canonicalSource);
      if (aliasFingerprint !== canonicalFingerprint) {
        return { alias, canonical, aliasFingerprint, canonicalFingerprint, reason: "source-mismatch" };
      }
      const [aliasMarkdown, canonicalMarkdown] = await Promise.all([
        convertToMarkdown(aliasSource, { codeLanguage: detectLanguage(alias) }),
        convertToMarkdown(canonicalSource, { codeLanguage: detectLanguage(canonical) }),
      ]);
      return {
        alias,
        canonical,
        aliasFingerprint,
        canonicalFingerprint,
        reason: equivalentMarkdownArtifacts(aliasMarkdown, canonicalMarkdown)
          ? "verified"
          : "artifact-mismatch",
        canonicalMarkdown,
        canonicalEntry: {
          path: canonical,
          title: canonicalSource.title,
          summary: canonicalSource.summary,
          category: canonicalSource.category,
          version: canonicalSource.version,
          icon: canonicalSource.icon,
          lastModified: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof PageNotFoundError) return { alias, aliasFingerprint, reason: "parent-missing" };
      throw error;
    }
  } catch (error) {
    return { alias, canonical, reason: "fetch-error", error: error instanceof Error ? error.message : String(error) };
  }
}

async function verifyRedirects(results: AuditResult[]): Promise<boolean[]> {
  const verified = new Array<boolean>(results.length);
  let cursor = 0;
  const fetchRedirect = async (url: string): Promise<Response> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fetch(url, {
          redirect: "manual",
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
  const workers = Array.from({ length: Math.min(8, results.length) }, async () => {
    while (cursor < results.length) {
      const index = cursor++;
      const result = results[index];
      const html = await fetchRedirect(`https://houdinimd.com/docs/${result.alias}?alias_audit=1`);
      const raw = await fetchRedirect(`https://houdinimd.com/docs/${result.alias}.md?alias_audit=1`);
      const htmlLocation = html.headers.get("location");
      const rawLocation = raw.headers.get("location");
      verified[index] = html.status === 308
        && raw.status === 308
        && Boolean(htmlLocation)
        && Boolean(rawLocation)
        && new URL(htmlLocation!, html.url).pathname === `/docs/${result.canonical}`
        && new URL(rawLocation!, raw.url).pathname === `/docs/${result.canonical}.md`
        && new URL(htmlLocation!, html.url).search === "?alias_audit=1"
        && new URL(rawLocation!, raw.url).search === "?alias_audit=1";
    }
  });
  await Promise.all(workers);
  return verified;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const stage = process.argv.includes("--stage");
  const cachedAliases = (await listR2Slugs()).filter((slug) => slug.endsWith("/index"));
  const aliases = [...new Set([...cachedAliases, ...await listStoredAliases()])].sort();
  const results: AuditResult[] = [];
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (cursor < aliases.length) {
      const alias = aliases[cursor++];
      const result = await audit(alias);
      results.push(result);
      console.log(`${result.reason.padEnd(15)} ${alias}`);
    }
  });
  await Promise.all(workers);

  const fetchErrors = results.filter((result) => result.reason === "fetch-error");
  if ((apply || stage) && fetchErrors.length) {
    throw new Error(`Audit had ${fetchErrors.length} fetch error(s); refusing to mutate production`);
  }

  const verified = results.filter((result) => result.reason === "verified");
  const index = await fetchSearchIndex();
  const indexed = new Set(index.map((entry) => entry.path));
  const missingTargets = verified.filter((result) => !result.canonical || !indexed.has(result.canonical));
  if (missingTargets.length) {
    console.error(`\n${missingTargets.length} verified target(s) are missing from the content index.`);
  }

  if (apply || stage) {
    if (stage) {
      await backUpObjects([
        "metadata/source-alias-audit.json",
        ...verified.flatMap((result) => [
          `content/${result.canonical}.md`,
          `${ALIAS_ROOT}/${result.alias}.json`,
          `${IDENTITY_ROOT}/${result.aliasFingerprint}.json`,
        ]),
      ]);
      for (const result of verified) {
        const verifiedAt = new Date().toISOString();
        const mapping: SourceAlias = {
          alias: result.alias,
          canonical: result.canonical!,
          fingerprint: result.aliasFingerprint!,
          verifiedAt,
        };
        await putMarkdown(`content/${result.canonical}.md`, result.canonicalMarkdown!);
        await putJson(`${IDENTITY_ROOT}/${mapping.fingerprint}.json`, {
          fingerprint: mapping.fingerprint,
          canonical: mapping.canonical,
          verifiedAt,
        });
        await putJson(`${ALIAS_ROOT}/${mapping.alias}.json`, mapping);
      }
      await putJson("metadata/source-alias-audit.json", {
        auditedAt: new Date().toISOString(),
        staged: true,
        results: results.sort((a, b) => a.alias.localeCompare(b.alias)),
      });
      console.log(`\nStaged ${verified.length} verified mappings without deleting content or changing indexes.`);
    }
  }

  if (apply) {
    const productionProbe = await fetch("https://houdinimd.com/api/source-alias-version", { cache: "no-store" });
    const productionVersion = productionProbe.ok
      ? (await productionProbe.json() as { version?: number }).version
      : undefined;
    if (productionVersion !== 1) {
      throw new Error("Production is not running alias-aware redirect code; deploy it before applying the backfill");
    }

    const direct = results.filter((result) =>
      result.reason === "parent-missing" || result.reason === "source-mismatch" || result.reason === "artifact-mismatch"
    );
    const metadataKeys = await listKeys(`${ALIAS_ROOT}/`);
    const identityKeys = await listKeys(`${IDENTITY_ROOT}/`);
    await backUpObjects([
      "content/index.json",
      LITE_INDEX_PATH,
      "metadata/source-alias-audit.json",
      ...metadataKeys,
      ...identityKeys,
      ...results.flatMap((result) => [
        `content/${result.alias}.md`,
        ...(result.canonical ? [`content/${result.canonical}.md`] : []),
      ]),
    ]);
    for (const result of verified) {
      await putMarkdown(`content/${result.canonical}.md`, result.canonicalMarkdown!);
    }
    const regenerated = await regenerateBatch([...new Set(direct.map((result) => result.alias))]);
    const failures = regenerated.filter((result) => result.status !== "ok");
    if (failures.length) throw new Error(`Could not regenerate ${failures.length} canonical target(s)`);

    const aliasesToRemove = new Set(verified.map((result) => result.alias));
    await mutateSearchIndex((currentIndex) => {
      const indexByPath = new Map(currentIndex.map((entry) => [entry.path, entry]));
      for (const result of verified) indexByPath.set(result.canonical!, result.canonicalEntry!);
      return [...indexByPath.values()].filter((entry) => !aliasesToRemove.has(entry.path));
    });

    for (const result of verified) {
      const verifiedAt = new Date().toISOString();
      const mapping: SourceAlias = {
        alias: result.alias,
        canonical: result.canonical!,
        fingerprint: result.aliasFingerprint!,
        verifiedAt,
      };
      await putJson(`${IDENTITY_ROOT}/${mapping.fingerprint}.json`, {
        fingerprint: mapping.fingerprint,
        canonical: mapping.canonical,
        verifiedAt,
      });
      await putJson(`${ALIAS_ROOT}/${mapping.alias}.json`, mapping);
      const stored = await getJson<SourceAlias>(`${ALIAS_ROOT}/${mapping.alias}.json`);
      if (!stored || stored.canonical !== mapping.canonical || stored.fingerprint !== mapping.fingerprint) {
        throw new Error(`Alias mapping verification failed for ${mapping.alias}`);
      }
    }
    await deleteAliasMappings(direct.map((result) => result.alias));
    await deleteVerifiedMarkdown(verified.map((result) => result.alias));
    await deleteAliasIsr(verified.map((result) => result.alias));

    const finalIndex = await fetchSearchIndex();
    const finalPaths = new Set(finalIndex.map((entry) => entry.path));
    const liteIndex = await getJson<Array<{ path: string }>>(LITE_INDEX_PATH);
    if (!liteIndex) throw new Error("Lite index is missing after backfill");
    const litePaths = new Set(liteIndex.map((entry) => entry.path));
    if (litePaths.size !== finalPaths.size || [...finalPaths].some((path) => !litePaths.has(path))) {
      throw new Error("Full and lite indexes disagree after backfill");
    }
    for (const result of verified) {
      if (finalPaths.has(result.alias) || !finalPaths.has(result.canonical!)) {
        throw new Error(`Index postcondition failed for ${result.alias}`);
      }
      const config = getConfig();
      const client = await getS3Client();
      if (!config || !client) throw new Error("R2 is not configured");
      await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: `content/${result.canonical}.md` }));
      const aliasExists = await client.send(new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: `content/${result.alias}.md`,
      })).then(
        () => true,
        (error: unknown) => {
          const status = error && typeof error === "object" && "$metadata" in error
            ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
            : undefined;
          if (status === 404 || (error instanceof Error && error.name === "NoSuchKey")) return false;
          throw error;
        },
      );
      if (aliasExists) throw new Error(`Duplicate Markdown remains for ${result.alias}`);
    }

    const verificationResults = await verifyRedirects(verified);
    if (verificationResults.some((passed) => !passed)) throw new Error("Production redirect postcondition failed");

    const sitemap = await fetch("https://houdinimd.com/sitemap.xml", { cache: "no-store" });
    const sitemapXml = await sitemap.text();
    for (const result of verified) {
      if (sitemapXml.includes(`/docs/${result.alias}<`) || !sitemapXml.includes(`/docs/${result.canonical}<`)) {
        throw new Error(`Sitemap postcondition failed for ${result.alias}`);
      }
    }
  } else {
    let storedMismatches = 0;
    for (const result of verified) {
      const stored = await getJson<SourceAlias>(`${ALIAS_ROOT}/${result.alias}.json`);
      if (stored && stored.fingerprint !== result.aliasFingerprint) {
        console.error(`stored-mismatch ${result.alias}`);
        storedMismatches++;
      }
    }
    if (storedMismatches) process.exitCode = 1;
  }

  if (apply) {
    await putJson("metadata/source-alias-audit.json", {
      auditedAt: new Date().toISOString(),
      results: results.sort((a, b) => a.alias.localeCompare(b.alias)),
    });
  }

  const counts = new Map<AuditReason, number>();
  for (const result of results) counts.set(result.reason, (counts.get(result.reason) ?? 0) + 1);
  console.log("\nAudit summary");
  for (const reason of ["verified", "parent-missing", "source-mismatch", "artifact-mismatch", "fetch-error"] as const) {
    console.log(`  ${reason.padEnd(15)} ${counts.get(reason) ?? 0}`);
  }
  if (!apply && !stage) console.log("\nRun with --stage to publish mappings safely, then --apply after deployment to deduplicate content and indexes.");
  if (!apply && !stage && missingTargets.length) process.exitCode = 1;
}

await main();
