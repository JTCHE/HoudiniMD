import { getConfig, getS3Client } from './config';

/**
 * One object from the content bucket, or null when it is not there. Read over
 * the public URL, and over the S3 API once that is closed.
 */
export async function readObject(key: string): Promise<string | null> {
  const config = getConfig();
  if (!config) return null;

  const response = await fetch(`${config.publicUrl}/${key}`).catch(() => null);
  if (response?.ok) return response.text();
  if (response?.status === 404) return null;

  const client = await getS3Client();
  if (!client) return null;
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  try {
    const object = await client.send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }));
    return (await object.Body?.transformToString('utf-8')) ?? null;
  } catch (error: unknown) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}
