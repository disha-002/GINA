import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

/**
 * Upload a buffer to S3.
 * @param key  S3 object key, e.g. `uploads/{userId}/{datasetId}/{filename}`
 */
export async function uploadToS3(
  s3: S3Client,
  key: string,
  body: Buffer,
  contentType = 'text/csv',
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Best-effort delete of an uploaded object (ignore missing key). */
export async function deleteFromS3(s3: S3Client, key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
    }),
  );
}
