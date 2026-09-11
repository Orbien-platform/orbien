import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SetTenantActiveService } from './set-tenant-active.service';
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
          is_active: (args.data as { is_active: boolean }).is_active,
        });
      },
      ...overrides,
    },
  };

  const prisma = { client } as unknown as PrismaService;
  return { service: new SetTenantActiveService(prisma), captured };
}

describe('SetTenantActiveService', () => {
  it('inativa o tenant', async () => {
    const { service, captured } = serviceWith();

    const result = await service.setActive('tenant-1', false);

    expect(captured.data).toEqual({ is_active: false });
    expect(result).toEqual({ tenant_id: 'tenant-1', slug: 'doca-church', is_active: false });
  });

  it('reativa o tenant', async () => {
    const { service } = serviceWith();

    const result = await service.setActive('tenant-1', true);

    expect(result).toEqual({ tenant_id: 'tenant-1', slug: 'doca-church', is_active: true });
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

    await expect(service.setActive('inexistente', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
