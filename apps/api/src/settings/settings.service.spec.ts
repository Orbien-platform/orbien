import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    tenant: { findUnique: jest.fn(), update: jest.fn() },
    congregation: { findUnique: jest.fn(), update: jest.fn() },
    brandingConfig: { findUnique: jest.fn(), upsert: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, storage?: Partial<StorageService>) {
  // A auditoria de `pix_key` vai por `audit_insert()` no client BASE, não
  // por `client.auditLog.create()` — ver `src/common/audit/write-audit-log.ts`.
  const auditRaw = jest.fn().mockResolvedValue(1);
  const prisma = {
    client,
    runInTx: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
    $executeRaw: auditRaw,
  } as unknown as PrismaService;
  const storageService = {
    deleteByUrl: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue('https://cdn/logo.png'),
    ...storage,
  } as unknown as StorageService;
  return { service: new SettingsService(prisma, storageService), storageService, auditRaw };
}

/** Posição dos valores no template de `audit_insert()` que o helper monta. */
const AUDIT = {
  tenant_id: 1,
  congregation_id: 2,
  actor_user_id: 3,
  subject_person_id: 4,
  entity: 5,
  action: 6,
  before: 7,
  after: 8,
} as const;

const TENANT = { name: 'Igreja', email: 't@x.com', phone: '111', slug: 'igreja-teste' };
const CONGREGATION = {
  name: 'Sede',
  address: 'Rua 1',
  timezone: 'America/Sao_Paulo',
  email: 'c@x.com',
  phone: '222',
  app_name: null,
  primary_color: null,
  accent_color: null,
  logo_url: null,
  logo_url_dark: null,
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
        accent_color: '#333',
        logo_url: 'https://cdn/logo-congregacao.png',
        logo_url_dark: 'https://cdn/logo-congregacao-dark.png',
      });
      client.brandingConfig.findUnique.mockResolvedValue({
        app_name: 'App do Tenant',
        primary_color: '#222',
        secondary_color: '#444',
        logo_url: 'https://cdn/logo-tenant.png',
        logo_url_dark: 'https://cdn/logo-tenant-dark.png',
        splash_url: 'https://cdn/splash.png',
      });
      const { service } = serviceWith(client);

      const result = await service.getSettings('t1', 'g1');

      expect(result.tenant).toEqual({
        name: 'Igreja',
        email: 't@x.com',
        phone: '111',
        slug: 'igreja-teste',
      });
      expect(result.branding).toEqual({
        app_name: 'App da Congregação',
        primary_color: '#111',
        accent_color: '#333',
        logo_url: 'https://cdn/logo-congregacao.png',
        logo_url_dark: 'https://cdn/logo-congregacao-dark.png',
        splash_url: 'https://cdn/splash.png',
        custom_domain: null,
        terms_url: null,
        pix_key: null,
      });
    });

    it('cai no branding do tenant quando a congregação não tem os campos preenchidos', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue({
        app_name: 'App do Tenant',
        primary_color: '#222',
        // a coluna do tenant se chama `secondary_color`; o campo exposto é
        // `accent_color` (ver ResolvedSettings em settings.service.ts)
        secondary_color: '#444',
        logo_url: 'https://cdn/logo-tenant.png',
        logo_url_dark: 'https://cdn/logo-tenant-dark.png',
        splash_url: null,
        custom_domain: 'doar.suaigreja.com.br',
        terms_url: 'https://suaigreja.com.br/termos',
      });
      const { service } = serviceWith(client);

      const result = await service.getSettings('t1', 'g1');

      expect(result.branding).toEqual({
        app_name: 'App do Tenant',
        primary_color: '#222',
        accent_color: '#444',
        logo_url: 'https://cdn/logo-tenant.png',
        logo_url_dark: 'https://cdn/logo-tenant-dark.png',
        splash_url: null,
        custom_domain: 'doar.suaigreja.com.br',
        terms_url: 'https://suaigreja.com.br/termos',
        pix_key: null,
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
        accent_color: null,
        logo_url: null,
        logo_url_dark: null,
        splash_url: null,
        custom_domain: null,
        terms_url: null,
        pix_key: null,
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
        service.updateSettings('t1', 'g1', ['admin_congregation'], { tenant: { name: 'Novo' } } as never, 'starter', 'u1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.tenant.update).not.toHaveBeenCalled();
    });

    it('atualiza tenant quando o papel tenant_admin está presente', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await service.updateSettings('t1', 'g1', ['tenant_admin'], { tenant: { name: 'Novo' } } as never, 'starter', 'u1');

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
      } as never, 'starter', 'u1');

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

      await service.updateSettings('t1', 'g1', ['admin_congregation'], {} as never, 'starter', 'u1');

      expect(client.tenant.update).not.toHaveBeenCalled();
      expect(client.congregation.update).not.toHaveBeenCalled();
    });

    // PROD-19 — domínio próprio e termos de uso.
    it('lança ForbiddenException ao alterar branding sem o papel tenant_admin', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(
        service.updateSettings(
          't1',
          'g1',
          ['admin_congregation'],
          { branding: { custom_domain: 'doar.suaigreja.com.br' } } as never,
          'premium',
          'u1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.brandingConfig.upsert).not.toHaveBeenCalled();
    });

    it('lança ForbiddenException ao alterar branding fora do plano Premium', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(
        service.updateSettings(
          't1',
          'g1',
          ['tenant_admin'],
          { branding: { custom_domain: 'doar.suaigreja.com.br' } } as never,
          'starter',
          'u1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.brandingConfig.upsert).not.toHaveBeenCalled();
    });

    it('grava custom_domain e terms_url quando tenant_admin e Premium', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      client.brandingConfig.upsert.mockResolvedValue({});
      const { service } = serviceWith(client);

      await service.updateSettings(
        't1',
        'g1',
        ['tenant_admin'],
        {
          branding: {
            custom_domain: 'doar.suaigreja.com.br',
            terms_url: 'https://suaigreja.com.br/termos',
          },
        } as never,
        'premium',
        'u1',
      );

      expect(client.brandingConfig.upsert).toHaveBeenCalledWith({
        where: { tenant_id: 't1' },
        create: {
          tenant_id: 't1',
          custom_domain: 'doar.suaigreja.com.br',
          terms_url: 'https://suaigreja.com.br/termos',
        },
        update: {
          custom_domain: 'doar.suaigreja.com.br',
          terms_url: 'https://suaigreja.com.br/termos',
        },
      });
    });

    it('lança BadRequestException quando custom_domain já pertence a outro tenant', async () => {
      const client = clientWith();
      client.brandingConfig.upsert.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflito', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['custom_domain'] },
        }),
      );
      const { service } = serviceWith(client);

      await expect(
        service.updateSettings(
          't1',
          'g1',
          ['tenant_admin'],
          { branding: { custom_domain: 'doar.suaigreja.com.br' } } as never,
          'premium',
          'u1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propaga qualquer outro erro do upsert sem convertê-lo', async () => {
      const client = clientWith();
      const erroInesperado = new Error('conexão perdida');
      client.brandingConfig.upsert.mockRejectedValue(erroInesperado);
      const { service } = serviceWith(client);

      await expect(
        service.updateSettings(
          't1',
          'g1',
          ['tenant_admin'],
          { branding: { custom_domain: 'doar.suaigreja.com.br' } } as never,
          'premium',
          'u1',
        ),
      ).rejects.toBe(erroInesperado);
    });

    // PIX manual — Starter (Cenário 1), sem gate de plano.
    it('grava pix_key com tenant_admin sem exigir Premium', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      client.brandingConfig.upsert.mockResolvedValue({});
      const { service } = serviceWith(client);

      await service.updateSettings(
        't1',
        'g1',
        ['tenant_admin'],
        { branding: { pix_key: 'chave@igreja.com' } } as never,
        'starter',
        'u1',
      );

      expect(client.brandingConfig.upsert).toHaveBeenCalledWith({
        where: { tenant_id: 't1' },
        create: { tenant_id: 't1', pix_key: 'chave@igreja.com' },
        update: { pix_key: 'chave@igreja.com' },
      });
    });

    it('lança ForbiddenException ao alterar pix_key sem o papel tenant_admin', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(
        service.updateSettings(
          't1',
          'g1',
          ['admin_congregation'],
          { branding: { pix_key: 'chave@igreja.com' } } as never,
          'starter',
          'u1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.brandingConfig.upsert).not.toHaveBeenCalled();
    });

    it('registra pix_key_updated em audit_logs com o valor anterior e o novo', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue({ pix_key: 'antiga@igreja.com' });
      client.brandingConfig.upsert.mockResolvedValue({});
      const { service, auditRaw } = serviceWith(client);

      await service.updateSettings(
        't1',
        'g1',
        ['tenant_admin'],
        { branding: { pix_key: 'nova@igreja.com' } } as never,
        'starter',
        'user-9',
      );

      expect(auditRaw).toHaveBeenCalledTimes(1);
      const call = auditRaw.mock.calls[0];
      expect(call[AUDIT.tenant_id]).toBe('t1');
      expect(call[AUDIT.congregation_id]).toBe('g1');
      expect(call[AUDIT.actor_user_id]).toBe('user-9');
      expect(call[AUDIT.entity]).toBe('branding_config');
      expect(call[AUDIT.action]).toBe('pix_key_updated');
      expect(call[AUDIT.before]).toBe(JSON.stringify({ pix_key: 'antiga@igreja.com' }));
      expect(call[AUDIT.after]).toBe(JSON.stringify({ pix_key: 'nova@igreja.com' }));
    });

    it('não grava auditoria quando branding não inclui pix_key', async () => {
      const client = clientWith();
      client.tenant.findUnique.mockResolvedValue(TENANT);
      client.congregation.findUnique.mockResolvedValue(CONGREGATION);
      client.brandingConfig.findUnique.mockResolvedValue(null);
      client.brandingConfig.upsert.mockResolvedValue({});
      const { service, auditRaw } = serviceWith(client);

      await service.updateSettings(
        't1',
        'g1',
        ['tenant_admin'],
        { branding: { custom_domain: 'doar.suaigreja.com.br' } } as never,
        'premium',
        'u1',
      );

      expect(auditRaw).not.toHaveBeenCalled();
    });
  });

  describe('uploadLogo', () => {
    it('lança BadRequestException quando nenhum arquivo é enviado', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(service.uploadLogo('t1', 'g1', undefined, 'light')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lança BadRequestException quando o mimetype não é suportado', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);
      const file = { mimetype: 'text/plain', buffer: Buffer.from(''), originalname: 'a.txt' } as Express.Multer.File;

      await expect(service.uploadLogo('t1', 'g1', file, 'light')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lança NotFoundException quando a congregação não existe', async () => {
      const client = clientWith();
      client.congregation.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);
      const file = { mimetype: 'image/png', buffer: Buffer.from(''), originalname: 'a.png' } as Express.Multer.File;

      await expect(service.uploadLogo('t1', 'g1', file, 'light')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('remove o logo claro anterior e salva a nova URL no campo claro', async () => {
      const client = clientWith();
      client.congregation.findUnique.mockResolvedValue({
        logo_url: 'https://cdn/old-logo.png',
        logo_url_dark: 'https://cdn/old-logo-dark.png',
      });
      client.congregation.update.mockResolvedValue({});
      const { service, storageService } = serviceWith(client);
      const file = { mimetype: 'image/webp', buffer: Buffer.from('img'), originalname: 'logo.webp' } as Express.Multer.File;

      const result = await service.uploadLogo('t1', 'g1', file, 'light');

      expect(storageService.deleteByUrl).toHaveBeenCalledWith('https://cdn/old-logo.png');
      expect(storageService.upload).toHaveBeenCalledWith(
        file.buffer,
        expect.stringContaining('branding/t1/g1/logo-light-'),
        'image/webp',
      );
      expect(client.congregation.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { logo_url: 'https://cdn/logo.png' },
      });
      expect(result).toEqual({ logo_url: 'https://cdn/logo.png', logo_url_dark: 'https://cdn/old-logo-dark.png' });
    });

    it('remove o logo escuro anterior e salva a nova URL no campo escuro, sem tocar no claro', async () => {
      const client = clientWith();
      client.congregation.findUnique.mockResolvedValue({
        logo_url: 'https://cdn/logo.png',
        logo_url_dark: 'https://cdn/old-logo-dark.png',
      });
      client.congregation.update.mockResolvedValue({});
      const { service, storageService } = serviceWith(client, {
        upload: jest.fn().mockResolvedValue('https://cdn/logo-dark.png'),
      });
      const file = { mimetype: 'image/webp', buffer: Buffer.from('img'), originalname: 'logo.webp' } as Express.Multer.File;

      const result = await service.uploadLogo('t1', 'g1', file, 'dark');

      expect(storageService.deleteByUrl).toHaveBeenCalledWith('https://cdn/old-logo-dark.png');
      expect(storageService.upload).toHaveBeenCalledWith(
        file.buffer,
        expect.stringContaining('branding/t1/g1/logo-dark-'),
        'image/webp',
      );
      expect(client.congregation.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { logo_url_dark: 'https://cdn/logo-dark.png' },
      });
      expect(result).toEqual({ logo_url: 'https://cdn/logo.png', logo_url_dark: 'https://cdn/logo-dark.png' });
    });
  });
});
