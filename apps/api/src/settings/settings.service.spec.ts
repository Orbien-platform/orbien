import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    tenant: { findUnique: jest.fn(), update: jest.fn() },
    congregation: { findUnique: jest.fn(), update: jest.fn() },
    brandingConfig: { findUnique: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, storage?: Partial<StorageService>) {
  const prisma = {
    client,
    runInTx: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  const storageService = {
    deleteByUrl: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue('https://cdn/logo.png'),
    ...storage,
  } as unknown as StorageService;
  return { service: new SettingsService(prisma, storageService), storageService };
}

const TENANT = { name: 'Igreja', email: 't@x.com', phone: '111' };
const CONGREGATION = {
  name: 'Sede',
  address: 'Rua 1',
  timezone: 'America/Sao_Paulo',
  email: 'c@x.com',
  phone: '222',
  app_name: null,
  primary_color: null,
  logo_url: null,
};

describe('SettingsService', () => {
  describe('getSettings', () => {
    it('resolve branding a partir da congregação quando presente', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue({
        ...CONGREGATION,
        app_name: 'App da Congregação',
        primary_color: '#111',
        logo_url: 'https://cdn/logo-congregacao.png',
      });
      client.brandingConfig.findUnique.mockResolvedValue({
        app_name: 'App do Tenant',
        primary_color: '#222',
        logo_url: 'https://cdn/logo-tenant.png',
        splash_url: 'https://cdn/splash.png',
      });
      const { service } = serviceWith(client);

      const result = await service.getSettings('t1', 'g1');

      expect(result.branding).toEqual({
        app_name: 'App da Congregação',
        primary_color: '#111',
        logo_url: 'https://cdn/logo-congregacao.png',
        splash_url: 'https://cdn/splash.png',
      });
    });

    it('cai no branding do tenant quando a congregação não tem os campos preenchidos', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue({
        app_name: 'App do Tenant',
        primary_color: '#222',
        logo_url: 'https://cdn/logo-tenant.png',
        splash_url: null,
      });
      const { service } = serviceWith(client);

      const result = await service.getSettings('t1', 'g1');

      expect(result.branding).toEqual({
        app_name: 'App do Tenant',
        primary_color: '#222',
        logo_url: 'https://cdn/logo-tenant.png',
        splash_url: null,
      });
    });

    it('retorna branding totalmente nulo quando não há brandingConfig nem dados na congregação', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      const result = await service.getSettings('t1', 'g1');

      expect(result.branding).toEqual({
        app_name: null,
        primary_color: null,
        logo_url: null,
        splash_url: null,
      });
    });

    it('lança NotFoundException quando o tenant não existe', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(null);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.getSettings('t1', 'g1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando a congregação não existe', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(null);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.getSettings('t1', 'g1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateSettings', () => {
    it('lança ForbiddenException ao alterar dados do tenant sem o papel tenant_admin', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(
        service.updateSettings('t1', 'g1', ['admin_congregation'], { tenant: { name: 'Novo' } } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.tenant.update).not.toHaveBeenCalled();
    });

    it('atualiza tenant quando o papel tenant_admin está presente', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await service.updateSettings('t1', 'g1', ['tenant_admin'], { tenant: { name: 'Novo' } } as never);

      expect(client.tenant.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { name: 'Novo' } });
    });

    it('atualiza congregation quando informado, sem exigir papel específico', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await service.updateSettings('t1', 'g1', ['admin_congregation'], {
        congregation: { name: 'Nova Sede' },
      } as never);

      expect(client.congregation.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { name: 'Nova Sede' },
      });
    });

    it('não atualiza nada quando dto não traz tenant nem congregation', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await service.updateSettings('t1', 'g1', ['admin_congregation'], {} as never);

      expect(client.tenant.update).not.toHaveBeenCalled();
      expect(client.congregation.update).not.toHaveBeenCalled();
    });
  });

  describe('uploadLogo', () => {
    it('lança BadRequestException quando nenhum arquivo é enviado', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(service.uploadLogo('t1', 'g1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança BadRequestException quando o mimetype não é suportado', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);
      const file = { mimetype: 'text/plain', buffer: Buffer.from(''), originalname: 'a.txt' } as Express.Multer.File;

      await expect(service.uploadLogo('t1', 'g1', file)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança NotFoundException quando a congregação não existe', async () => {
      const client = clientWith();
      client.congregation.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);
      const file = { mimetype: 'image/png', buffer: Buffer.from(''), originalname: 'a.png' } as Express.Multer.File;

      await expect(service.uploadLogo('t1', 'g1', file)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove o logo anterior e salva a nova URL', async () => {
      const client = clientWith();
      client.congregation.findUnique.mockResolvedValue({ logo_url: 'https://cdn/old-logo.png' });
      client.congregation.update.mockResolvedValue({});
      const { service, storageService } = serviceWith(client);
      const file = { mimetype: 'image/webp', buffer: Buffer.from('img'), originalname: 'logo.webp' } as Express.Multer.File;

      const result = await service.uploadLogo('t1', 'g1', file);

      expect(storageService.deleteByUrl).toHaveBeenCalledWith('https://cdn/old-logo.png');
      expect(storageService.upload).toHaveBeenCalledWith(
        file.buffer,
        expect.stringContaining('branding/t1/g1/logo-'),
        'image/webp',
      );
      expect(client.congregation.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { logo_url: 'https://cdn/logo.png' },
      });
      expect(result).toEqual({ logo_url: 'https://cdn/logo.png' });
    });
  });
});
