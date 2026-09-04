const sendMock = jest.fn();
const getSignedUrlMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input, __type: 'Put' })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input, __type: 'Get' })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input, __type: 'Delete' })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

const ORIGINAL_ENV = process.env;

async function* asyncIterable(chunks: Uint8Array[]) {
  for (const chunk of chunks) yield chunk;
}

describe('StorageService', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      R2_ACCOUNT_ID: 'acc1',
      R2_ACCESS_KEY_ID: 'key1',
      R2_SECRET_ACCESS_KEY: 'secret1',
      R2_BUCKET_NAME: 'bucket1',
      R2_PUBLIC_DOMAIN: 'cdn.exemplo.com',
    };
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
    (S3Client as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('configura o client S3 apontando para o endpoint do R2', () => {
    new StorageService();

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'auto',
        endpoint: 'https://acc1.r2.cloudflarestorage.com',
        credentials: { accessKeyId: 'key1', secretAccessKey: 'secret1' },
      }),
    );
  });

  it('usa string vazia como credencial quando as variáveis de ambiente não estão definidas', () => {
    delete process.env['R2_ACCESS_KEY_ID'];
    delete process.env['R2_SECRET_ACCESS_KEY'];

    new StorageService();

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({ credentials: { accessKeyId: '', secretAccessKey: '' } }),
    );
  });

  describe('upload', () => {
    it('envia o objeto e retorna a URL pública (domínio sem protocolo)', async () => {
      sendMock.mockResolvedValue({});
      const service = new StorageService();

      const url = await service.upload(Buffer.from('conteudo'), 'k1', 'image/png');

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'bucket1',
        Key: 'k1',
        Body: Buffer.from('conteudo'),
        ContentType: 'image/png',
      });
      expect(url).toBe('https://cdn.exemplo.com/k1');
    });

    it('usa string vazia como domínio quando R2_PUBLIC_DOMAIN não está definido', async () => {
      delete process.env['R2_PUBLIC_DOMAIN'];
      sendMock.mockResolvedValue({});
      const service = new StorageService();

      const url = await service.upload(Buffer.from('x'), 'k1', 'image/png');

      expect(url).toBe('https:///k1');
    });

    it('preserva o domínio quando já vem com protocolo', async () => {
      process.env['R2_PUBLIC_DOMAIN'] = 'https://cdn.exemplo.com';
      sendMock.mockResolvedValue({});
      const service = new StorageService();

      const url = await service.upload(Buffer.from('x'), 'k1', 'image/png');

      expect(url).toBe('https://cdn.exemplo.com/k1');
    });
  });

  describe('delete', () => {
    it('remove o objeto pela key', async () => {
      sendMock.mockResolvedValue({});
      const service = new StorageService();

      await service.delete('k1');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({ Bucket: 'bucket1', Key: 'k1' });
    });
  });

  describe('keyFromUrl', () => {
    it('extrai a key quando a URL pertence ao domínio público', () => {
      const service = new StorageService();

      expect(service.keyFromUrl('https://cdn.exemplo.com/pasta/arquivo.png')).toBe('pasta/arquivo.png');
    });

    it('retorna null quando a URL não pertence ao domínio público', () => {
      const service = new StorageService();

      expect(service.keyFromUrl('https://outro-dominio.com/a.png')).toBeNull();
    });
  });

  describe('deleteByUrl', () => {
    it('não faz nada quando a URL é null ou undefined', async () => {
      const service = new StorageService();

      await service.deleteByUrl(null);
      await service.deleteByUrl(undefined);

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('não faz nada quando a URL não pertence ao domínio público', async () => {
      const service = new StorageService();

      await service.deleteByUrl('https://outro-dominio.com/a.png');

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('remove o objeto quando a URL pertence ao domínio público', async () => {
      sendMock.mockResolvedValue({});
      const service = new StorageService();

      await service.deleteByUrl('https://cdn.exemplo.com/pasta/a.png');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({ Bucket: 'bucket1', Key: 'pasta/a.png' });
    });

    it('não propaga falha do storage — apenas loga aviso', async () => {
      sendMock.mockRejectedValue(new Error('R2 fora do ar'));
      const service = new StorageService();

      await expect(service.deleteByUrl('https://cdn.exemplo.com/a.png')).resolves.toBeUndefined();
    });
  });

  describe('downloadBuffer', () => {
    it('retorna buffer vazio quando o objeto não tem Body', async () => {
      sendMock.mockResolvedValue({ Body: undefined });
      const service = new StorageService();

      const buf = await service.downloadBuffer('k1');

      expect(buf).toEqual(Buffer.alloc(0));
    });

    it('concatena os chunks do Body em um único buffer', async () => {
      sendMock.mockResolvedValue({
        Body: asyncIterable([new Uint8Array([1, 2]), new Uint8Array([3, 4])]),
      });
      const service = new StorageService();

      const buf = await service.downloadBuffer('k1');

      expect(buf).toEqual(Buffer.from([1, 2, 3, 4]));
    });
  });

  describe('getPresignedGetUrl', () => {
    it('gera a URL assinada com o expiresIn default (86400s)', async () => {
      getSignedUrlMock.mockResolvedValue('https://signed.example/a');
      const service = new StorageService();

      const url = await service.getPresignedGetUrl('k1');

      expect(getSignedUrlMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ input: { Bucket: 'bucket1', Key: 'k1' } }),
        { expiresIn: 86_400 },
      );
      expect(url).toBe('https://signed.example/a');
    });

    it('respeita o expiresIn informado', async () => {
      getSignedUrlMock.mockResolvedValue('https://signed.example/b');
      const service = new StorageService();

      await service.getPresignedGetUrl('k1', 3600);

      expect(getSignedUrlMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: 3600 });
    });
  });
});
