import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

  private publicBase(): string {
    const domain = process.env['R2_PUBLIC_DOMAIN'] ?? '';
    return /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
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

    const url = `${this.publicBase()}/${key}`;
    this.logger.log(`Uploaded: ${url}`);
    return url;
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: process.env['R2_BUCKET_NAME'], Key: key }),
    );
    this.logger.log(`Deleted: ${key}`);
  }

  // Extrai a key de uma URL pública gerada por upload(). Retorna null se a URL
  // não pertencer ao domínio público configurado (ex: media_url externa).
  keyFromUrl(url: string): string | null {
    const prefix = `${this.publicBase()}/`;
    if (!url.startsWith(prefix)) return null;
    return url.slice(prefix.length);
  }

  // Remove o objeto referenciado por uma URL pública, sem propagar falhas —
  // usado em fluxos de substituição/exclusão onde um erro de storage (ex:
  // arquivo já removido) não deve bloquear a operação principal do usuário.
  async deleteByUrl(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const key = this.keyFromUrl(url);
    if (!key) return;
    try {
      await this.delete(key);
    } catch (err) {
      this.logger.warn(`Falha ao remover objeto do R2 (key=${key}): ${String(err)}`);
    }
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
