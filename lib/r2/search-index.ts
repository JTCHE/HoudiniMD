import { getConfig, getS3Client } from './config';

export interface SearchIndexEntry {
  path: string;
  title: string;
  summary: string;
  category: string;
  version: string;
  /** Absolute URL of the page icon (from .pageicon img), if the page has one. */
  icon?: string;
  lastModified?: string;
}

/** Slim projection for exact/prefix lookups (/api/resolve) — fields it actually
 * uses, pre-normalized so the request path never re-derives them. ~34% the size
 * of the full index, which is the difference between a cold Worker isolate
 * parsing it in time and blowing the 10ms CPU limit (Error 1102). */
export interface LiteIndexEntry {
  path: string;
  title: string;
  /** title.toLowerCase() with whitespace stripped */
  t: string;
  /** last path segment, lowercased */
  s: string;
}

export function toLiteIndex(entries: SearchIndexEntry[]): LiteIndexEntry[] {
  return entries.map((e) => ({
    path: e.path,
    title: e.title,
    t: e.title.toLowerCase().replace(/\s+/g, ''),
    s: e.path.split('/').pop()?.toLowerCase() ?? '',
  }));
}

const INDEX_PATH = 'content/index.json';
export const LITE_INDEX_PATH = 'content/index-lite.json';

/** Derived from `entries` — always regenerated alongside the full index so it
 * can never drift out of sync (see toLiteIndex above). */
export async function putLiteIndex(
  client: import('@aws-sdk/client-s3').S3Client,
  bucketName: string,
  entries: SearchIndexEntry[],
): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: LITE_INDEX_PATH,
      Body: JSON.stringify(toLiteIndex(entries)),
      ContentType: 'application/json; charset=utf-8',
    }),
  );
}

interface IndexSnapshot {
  entries: SearchIndexEntry[];
  etag?: string;
}

async function readIndexSnapshot(
  client: import('@aws-sdk/client-s3').S3Client,
  bucketName: string,
): Promise<IndexSnapshot> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: INDEX_PATH }));
    return {
      entries: response.Body ? JSON.parse(await response.Body.transformToString('utf-8')) : [],
      etag: response.ETag,
    };
  } catch (error: unknown) {
    const status = error && typeof error === 'object' && '$metadata' in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
    if (status === 404 || (error instanceof Error && error.name === 'NoSuchKey')) return { entries: [] };
    throw error;
  }
}

async function syncLiteIndex(
  client: import('@aws-sdk/client-s3').S3Client,
  bucketName: string,
): Promise<void> {
  const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await readIndexSnapshot(client, bucketName);
    await putLiteIndex(client, bucketName, snapshot.entries);
    const head = await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: INDEX_PATH }));
    if (head.ETag === snapshot.etag) return;
  }
  throw new Error('Search index changed repeatedly while deriving the lite index');
}

export async function mutateSearchIndex(
  mutate: (entries: SearchIndexEntry[]) => SearchIndexEntry[],
): Promise<SearchIndexEntry[]> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) throw new Error('R2 is not configured');
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');

  for (let attempt = 0; attempt < 8; attempt++) {
    const snapshot = await readIndexSnapshot(client, config.bucketName);
    const entries = mutate(snapshot.entries).sort((a, b) => a.path.localeCompare(b.path));
    try {
      await client.send(new PutObjectCommand({
        Bucket: config.bucketName,
        Key: INDEX_PATH,
        Body: JSON.stringify(entries),
        ContentType: 'application/json; charset=utf-8',
        ...(snapshot.etag ? { IfMatch: snapshot.etag } : { IfNoneMatch: '*' }),
      }));
      await syncLiteIndex(client, config.bucketName);
      return entries;
    } catch (error: unknown) {
      const status = error && typeof error === 'object' && '$metadata' in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
      if (status !== 409 && status !== 412) throw error;
    }
  }
  throw new Error('Search index stayed busy during all conditional update attempts');
}

/**
 * Update the search index in R2
 */
export async function updateSearchIndex(entry: SearchIndexEntry, removePaths: string[] = []): Promise<void> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) {
    console.log(`[dev] R2 not configured, skipping search index update for: ${entry.path}`);
    return;
  }

  const pathsToRemove = new Set(removePaths);
  const entryWithTimestamp = { ...entry, lastModified: new Date().toISOString() };
  try {
    await mutateSearchIndex((current) => {
      const index = current.filter((existing) => !pathsToRemove.has(existing.path));
      const existing = index.findIndex((candidate) => candidate.path === entry.path);
      if (existing >= 0) index[existing] = entryWithTimestamp;
      else index.push(entryWithTimestamp);
      return index;
    });
  } catch (error) {
    console.error(`Failed to update search index in R2: ${error}`);
    throw error;
  }
}
