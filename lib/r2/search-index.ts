import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getConfig, getS3Client } from './config';

export interface SearchIndexEntry {
  path: string;
  title: string;
  summary: string;
  category: string;
  version: string;
  lastModified?: string;
}

const INDEX_PATH = 'content/index.json';

/**
 * Update the search index in R2
 */
export async function updateSearchIndex(entry: SearchIndexEntry): Promise<void> {
  const config = getConfig();
  const client = getS3Client();
  if (!config || !client) {
    console.log(`[dev] R2 not configured, skipping search index update for: ${entry.path}`);
    return;
  }

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
      Body: JSON.stringify(index, null, 2),
      ContentType: 'application/json; charset=utf-8',
    }));
  } catch (error) {
    console.error(`Failed to update search index in R2: ${error}`);
    throw error;
  }
}
