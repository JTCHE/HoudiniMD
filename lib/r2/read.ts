import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getConfig, getS3Client } from './config';

let indexCache: { data: string; expiry: number } | null = null;
const INDEX_CACHE_TTL = 5 * 60 * 1000;

export async function fetchIndexJson(): Promise<string | null> {
  if (indexCache && Date.now() < indexCache.expiry) return indexCache.data;
  const raw = await fetchFromR2("content/index.json", true); // noValidate: JSON has no frontmatter
  if (raw) indexCache = { data: raw, expiry: Date.now() + INDEX_CACHE_TTL };
  return raw;
}

/** Cached files generated before this date will be re-generated */
const CACHE_INVALIDATE_BEFORE = new Date("2026-03-13T22:00:00Z");

/**
 * Check if a file exists in R2
 */
export async function fileExistsInR2(filePath: string): Promise<boolean> {
  const config = getConfig();
  const client = getS3Client();
  if (!config || !client) return false;

  try {
    await client.send(new HeadObjectCommand({
      Bucket: config.bucketName,
      Key: filePath,
    }));
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
      return false;
    }
    // Also check for $metadata.httpStatusCode === 404
    if (error && typeof error === 'object' && '$metadata' in error) {
      const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
      if (metadata?.httpStatusCode === 404) {
        return false;
      }
    }
    throw error;
  }
}

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Fetch file content from R2 using the public URL (faster for reads).
 * Returns null if the file is missing or older than 30 days (triggering regeneration).
 */
export async function fetchFromR2(filePath: string, noValidate = false): Promise<string | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    // Use public URL for reads (faster, no auth required)
    const publicUrl = `${config.publicUrl}/${filePath}`;
    const response = await fetch(publicUrl);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch from R2: ${response.status} ${response.statusText}`);
    }

    const lastModified = response.headers.get('last-modified');
    if (lastModified) {
      const age = Date.now() - new Date(lastModified).getTime();
      if (age > CACHE_MAX_AGE_MS) {
        return null;
      }
    }

    const text = await response.text();

    // Invalidate stale content based on generated_at frontmatter (skip for metadata reads)
    if (!noValidate) {
      const generatedAtMatch = text.match(/^---[\s\S]*?generated_at:\s*(.+?)\s*\n[\s\S]*?---/);
      if (generatedAtMatch) {
        const generatedAt = new Date(generatedAtMatch[1]);
        if (generatedAt < CACHE_INVALIDATE_BEFORE) return null;
      } else {
        return null;
      }
    }

    return text;
  } catch (error: unknown) {
    // Network errors or 404s
    if (error instanceof Error && error.message.includes('404')) {
      return null;
    }
    // If public URL fails, try S3 API as fallback
    return fetchFromR2WithS3Api(filePath);
  }
}

/**
 * Fallback: Fetch using S3 API (authenticated)
 */
async function fetchFromR2WithS3Api(filePath: string): Promise<string | null> {
  const config = getConfig();
  const client = getS3Client();
  if (!config || !client) return null;

  try {
    const response = await client.send(new GetObjectCommand({
      Bucket: config.bucketName,
      Key: filePath,
    }));

    if (!response.Body) {
      return null;
    }

    return await response.Body.transformToString('utf-8');
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
      return null;
    }
    if (error && typeof error === 'object' && '$metadata' in error) {
      const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
      if (metadata?.httpStatusCode === 404) {
        return null;
      }
    }
    throw error;
  }
}
