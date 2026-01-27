import { S3Client } from '@aws-sdk/client-s3';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

let cachedConfig: R2Config | null | undefined;
let cachedClient: S3Client | null | undefined;

export function getConfig(): R2Config | null {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    cachedConfig = null;
    return null;
  }

  cachedConfig = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl,
  };

  return cachedConfig;
}

export function getS3Client(): S3Client | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const config = getConfig();
  if (!config) {
    cachedClient = null;
    return null;
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedClient;
}
