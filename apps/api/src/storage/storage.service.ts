import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
        secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
      },
    });
  }

  async upload(buffer: Buffer, key: string, contentType: string): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: process.env['R2_BUCKET_NAME'],
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    const url = `https://${process.env['R2_PUBLIC_DOMAIN']}/${key}`;
    this.logger.log(`Uploaded: ${url}`);
    return url;
  }

  async downloadBuffer(key: string): Promise<Buffer> {
    const { Body } = await this.s3.send(
      new GetObjectCommand({ Bucket: process.env['R2_BUCKET_NAME'], Key: key }),
    );
    if (!Body) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    for await (const chunk of Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getPresignedGetUrl(key: string, expiresInSeconds = 86_400): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: process.env['R2_BUCKET_NAME'],
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }
}
