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

/**
 * Update the search index in R2
 */
export async function updateSearchIndex(entry: SearchIndexEntry): Promise<void> {
  const config = getConfig();
  const client = await getS3Client();
  if (!config || !client) {
    console.log(`[dev] R2 not configured, skipping search index update for: ${entry.path}`);
    return;
  }

  const { GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');

  let index: SearchIndexEntry[] = [];

  // Fetch existing index
  try {
    const response = await client.send(new GetObjectCommand({
      Bucket: config.bucketName,
      Key: INDEX_PATH,
    }));

    if (response.Body) {
      const content = await response.Body.transformToString('utf-8');
      index = JSON.parse(content);
    }
  } catch (error: unknown) {
    // If index doesn't exist yet, start with empty array
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
      index = [];
    } else if (error && typeof error === 'object' && '$metadata' in error) {
      const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
      if (metadata?.httpStatusCode === 404) {
        index = [];
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  // Update or add entry
  const entryWithTimestamp = { ...entry, lastModified: new Date().toISOString() };
  const existingIndex = index.findIndex((e) => e.path === entry.path);
  if (existingIndex >= 0) {
    index[existingIndex] = entryWithTimestamp;
  } else {
    index.push(entryWithTimestamp);
  }

  // Sort alphabetically
  index.sort((a, b) => a.path.localeCompare(b.path));

  // Save back to R2
  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: INDEX_PATH,
      Body: JSON.stringify(index),
      ContentType: 'application/json; charset=utf-8',
    }));
    await putLiteIndex(client, config.bucketName, index);
  } catch (error) {
    console.error(`Failed to update search index in R2: ${error}`);
    throw error;
  }
}
