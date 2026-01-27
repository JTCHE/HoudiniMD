import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getConfig, getS3Client } from './config';

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

/**
 * Fetch file content from R2 using the public URL (faster for reads)
 */
export async function fetchFromR2(filePath: string): Promise<string | null> {
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

    return await response.text();
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
