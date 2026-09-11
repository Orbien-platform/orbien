import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UpdateTenantService } from './update-tenant.service';
import { PrismaService } from '../prisma/prisma.service';

function serviceWith(overrides: Record<string, unknown> = {}) {
  const captured: { data?: unknown } = {};

  const client = {
    tenant: {
      update: (args: { data: unknown }) => {
        captured.data = args.data;
        return Promise.resolve({
          id: 'tenant-1',
          slug: 'doca-church',
          name: 'Doca Church',
          email: 'contato@doca.test',
          phone: null,
          is_active: true,
        });
      },
      ...overrides,
    },
  };

  const prisma = { client } as unknown as PrismaService;
  return { service: new UpdateTenantService(prisma), captured };
}

describe('UpdateTenantService', () => {
  it('grava só os campos enviados', async () => {
    const { service, captured } = serviceWith();

    await service.update('tenant-1', { name: 'Novo Nome' });

    expect(captured.data).toEqual({ name: 'Novo Nome' });
  });

  it('devolve o tenant atualizado, incluindo is_active', async () => {
    const { service } = serviceWith();

    const result = await service.update('tenant-1', { name: 'Novo Nome' });

    expect(result).toEqual({
      tenant_id: 'tenant-1',
      slug: 'doca-church',
      name: 'Doca Church',
      email: 'contato@doca.test',
      phone: null,
      is_active: true,
    });
  });

  it('devolve NotFoundException quando o tenant não existe (P2025)', async () => {
    const { service } = serviceWith({
      update: () => {
        throw new Prisma.PrismaClientKnownRequestError('não encontrado', {
          code: 'P2025',
          clientVersion: '6.0.0',
        });
      },
    });

    await expect(service.update('inexistente', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('propaga qualquer outro erro', async () => {
    const boom = new Error('boom');
    const { service } = serviceWith({
      update: () => {
        throw boom;
      },
    });

    await expect(service.update('tenant-1', { name: 'X' })).rejects.toBe(boom);
  });
});
