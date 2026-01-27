import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getConfig, getS3Client } from './config';

/**
 * Save a file to R2
 */
export async function saveToR2(
  filePath: string,
  content: string,
): Promise<void> {
  const config = getConfig();
  const client = getS3Client();
  if (!config || !client) {
    console.log(`[dev] R2 not configured, skipping save for: ${filePath}`);
    return;
  }

  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: filePath,
      Body: content,
      ContentType: 'text/markdown; charset=utf-8',
    }));
  } catch (error) {
    console.error(`Failed to save to R2: ${error}`);
    throw error;
  }
}
