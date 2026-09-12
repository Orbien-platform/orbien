import { BadRequestException } from '@nestjs/common';
import { MemberCapService, STARTER_MEMBER_CAP } from './member-cap.service';
import { PrismaService } from '../prisma/prisma.service';

function serviceWith(overrides: Record<string, unknown> = {}) {
  const client = {
    tenantPlan: { findUnique: jest.fn() },
    person: { count: jest.fn() },
    ...overrides,
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new MemberCapService(prisma), client };
}

describe('MemberCapService', () => {
  it('libera sem consultar contagem quando o tenant é Premium', async () => {
    const { service, client } = serviceWith();
    client.tenantPlan.findUnique.mockResolvedValue({ plan: 'premium' });

    await expect(service.assertCanPromoteToMember('t1')).resolves.toBeUndefined();
    expect(client.person.count).not.toHaveBeenCalled();
  });

  it('libera Starter abaixo do teto', async () => {
    const { service, client } = serviceWith();
    client.tenantPlan.findUnique.mockResolvedValue({ plan: 'starter' });
    client.person.count.mockResolvedValue(STARTER_MEMBER_CAP - 1);

    await expect(service.assertCanPromoteToMember('t1')).resolves.toBeUndefined();
  });

  it('barra Starter no teto exato — 300 já conta como cheio, a próxima promoção estoura', async () => {
    const { service, client } = serviceWith();
    client.tenantPlan.findUnique.mockResolvedValue({ plan: 'starter' });
    client.person.count.mockResolvedValue(STARTER_MEMBER_CAP);

    await expect(service.assertCanPromoteToMember('t1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('barra Starter acima do teto', async () => {
    const { service, client } = serviceWith();
    client.tenantPlan.findUnique.mockResolvedValue({ plan: 'starter' });
    client.person.count.mockResolvedValue(STARTER_MEMBER_CAP + 5);

    await expect(service.assertCanPromoteToMember('t1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('tenant sem TenantPlan é tratado como Starter — o teto mais restritivo, não o mais permissivo', async () => {
    const { service, client } = serviceWith();
    client.tenantPlan.findUnique.mockResolvedValue(null);
    client.person.count.mockResolvedValue(STARTER_MEMBER_CAP);

    await expect(service.assertCanPromoteToMember('t1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('só conta membros ativos (deleted_at nulo) do próprio tenant', async () => {
    const { service, client } = serviceWith();
    client.tenantPlan.findUnique.mockResolvedValue({ plan: 'starter' });
    client.person.count.mockResolvedValue(0);

    await service.assertCanPromoteToMember('t1');

    expect(client.person.count).toHaveBeenCalledWith({
      where: { tenant_id: 't1', classification: 'member', deleted_at: null },
    });
  });
});
