import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { KidsGuardiansService } from './kids-guardians.service';
import type { KidsActor } from './kids-child-access.service';
import { PrismaService } from '../../prisma/prisma.service';

const actor: KidsActor = { userId: 'u1', tenantId: 't1', congregationId: 'g1', roles: ['member'] };

function setup() {
  const client = {
    person: { findFirst: jest.fn(), create: jest.fn() },
    kidsGuardian: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn(), count: jest.fn() },
  };
  const access = { assertCanAccess: jest.fn().mockResolvedValue({ id: 'child1' }) };
  client.person.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p-new', ...data }));
  client.kidsGuardian.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'kg1', ...data }));
  const service = new KidsGuardiansService({ client } as unknown as PrismaService, access as never);
  return { client, access, service };
}

describe('KidsGuardiansService.add', () => {
  it('terceiro novo: cria Person (nome, telefone, foto) sem conta e grava o KidsGuardian com can_pickup (AC 3)', async () => {
    const { client, service } = setup();
    client.kidsGuardian.findFirst.mockResolvedValue(null);

    const result = await service.add(actor, 'child1', {
      full_name: 'Dona Rosa',
      phone: '11999990000',
      photo_url: 'https://x.test/rosa.jpg',
      relationship: 'avó',
    });

    expect(client.person.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: 't1',
        congregation_id: 'g1',
        full_name: 'Dona Rosa',
        phone: '11999990000',
        photo_url: 'https://x.test/rosa.jpg',
        is_child: false,
      }),
    });
    expect(client.kidsGuardian.create).toHaveBeenCalledWith({
      data: {
        tenant_id: 't1',
        congregation_id: 'g1',
        child_id: 'child1',
        guardian_person_id: 'p-new',
        relationship: 'avó',
        can_pickup: true,
        is_primary: false,
      },
    });
    expect(result).toMatchObject({ id: 'kg1', can_pickup: true, is_primary: false });
  });

  it('pessoa já cadastrada: reaproveita, sem criar Person', async () => {
    const { client, service } = setup();
    client.person.findFirst.mockResolvedValue({ id: 'p-pai' });
    client.kidsGuardian.findFirst.mockResolvedValue(null);

    await service.add(actor, 'child1', { guardian_person_id: 'p-pai', relationship: 'pai', is_primary: true });

    expect(client.person.create).not.toHaveBeenCalled();
    expect(client.kidsGuardian.create.mock.calls[0][0].data).toMatchObject({
      guardian_person_id: 'p-pai',
      is_primary: true,
      can_pickup: true,
    });
  });

  it('o acesso à criança é checado antes (criança alheia: 404, nada gravado)', async () => {
    const { client, access, service } = setup();
    access.assertCanAccess.mockRejectedValue(new NotFoundException('Criança não encontrada'));

    await expect(
      service.add(actor, 'child1', { full_name: 'X', phone: '1', relationship: 'tio' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.person.create).not.toHaveBeenCalled();
    expect(client.kidsGuardian.create).not.toHaveBeenCalled();
  });

  it('pessoa indicada inexistente ou criança: 404', async () => {
    const { client, service } = setup();
    client.person.findFirst.mockResolvedValue(null);

    await expect(
      service.add(actor, 'child1', { guardian_person_id: 'nope', relationship: 'tio' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ is_child: false, deleted_at: null }) }),
    );
  });

  it('a mesma pessoa duas vezes na criança: 409', async () => {
    const { client, service } = setup();
    client.person.findFirst.mockResolvedValue({ id: 'p-pai' });
    client.kidsGuardian.findFirst.mockResolvedValue({ id: 'kg0' });

    await expect(
      service.add(actor, 'child1', { guardian_person_id: 'p-pai', relationship: 'pai' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.kidsGuardian.create).not.toHaveBeenCalled();
  });

  it('primário que não pode retirar não faz sentido: 400', async () => {
    const { service } = setup();

    await expect(
      service.add(actor, 'child1', { full_name: 'X', phone: '1', relationship: 'tio', is_primary: true, can_pickup: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sem pessoa indicada e sem nome+telefone: 400', async () => {
    const { service } = setup();

    await expect(service.add(actor, 'child1', { relationship: 'tio' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.add(actor, 'child1', { full_name: 'X', relationship: 'tio' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('KidsGuardiansService.remove', () => {
  const row = (extra: Record<string, unknown> = {}) => ({
    id: 'kg1',
    child_id: 'child1',
    is_primary: false,
    ...extra,
  });

  it('remove terceiro autorizado', async () => {
    const { client, access, service } = setup();
    client.kidsGuardian.findFirst.mockResolvedValue(row());

    await service.remove(actor, 'kg1');

    expect(access.assertCanAccess).toHaveBeenCalledWith(actor, 'child1');
    expect(client.kidsGuardian.delete).toHaveBeenCalledWith({ where: { id: 'kg1' } });
  });

  it('remover o último primário: 422 e nada é apagado (AC 4)', async () => {
    const { client, service } = setup();
    client.kidsGuardian.findFirst.mockResolvedValue(row({ is_primary: true }));
    client.kidsGuardian.count.mockResolvedValue(0);

    await expect(service.remove(actor, 'kg1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(client.kidsGuardian.delete).not.toHaveBeenCalled();
    expect(client.kidsGuardian.count).toHaveBeenCalledWith({
      where: { child_id: 'child1', is_primary: true, id: { not: 'kg1' } },
    });
  });

  it('remover um primário havendo outro primário é permitido', async () => {
    const { client, service } = setup();
    client.kidsGuardian.findFirst.mockResolvedValue(row({ is_primary: true }));
    client.kidsGuardian.count.mockResolvedValue(1);

    await service.remove(actor, 'kg1');

    expect(client.kidsGuardian.delete).toHaveBeenCalled();
  });

  it('autorizado inexistente na congregação: 404', async () => {
    const { client, service } = setup();
    client.kidsGuardian.findFirst.mockResolvedValue(null);

    await expect(service.remove(actor, 'kg1')).rejects.toBeInstanceOf(NotFoundException);
    expect(client.kidsGuardian.findFirst).toHaveBeenCalledWith({
      where: { id: 'kg1', tenant_id: 't1', congregation_id: 'g1' },
    });
  });

  it('autorizado de criança alheia: 404 vindo do acesso, nada apagado', async () => {
    const { client, access, service } = setup();
    client.kidsGuardian.findFirst.mockResolvedValue(row());
    access.assertCanAccess.mockRejectedValue(new NotFoundException('Criança não encontrada'));

    await expect(service.remove(actor, 'kg1')).rejects.toBeInstanceOf(NotFoundException);
    expect(client.kidsGuardian.delete).not.toHaveBeenCalled();
  });
});

describe('KidsGuardiansService.list', () => {
  it('lista os autorizados da criança com nome e telefone, depois do acesso checado', async () => {
    const { client, access, service } = setup();
    client.kidsGuardian.findMany.mockResolvedValue([
      {
        id: 'kg1',
        guardian_person_id: 'p1',
        relationship: 'mãe',
        can_pickup: true,
        is_primary: true,
        guardian: { full_name: 'Maria', phone: '11', photo_url: null },
      },
    ]);

    const result = await service.list(actor, 'child1');

    expect(access.assertCanAccess).toHaveBeenCalledWith(actor, 'child1');
    expect(result).toEqual([
      {
        id: 'kg1',
        guardian_person_id: 'p1',
        full_name: 'Maria',
        phone: '11',
        photo_url: null,
        relationship: 'mãe',
        can_pickup: true,
        is_primary: true,
      },
    ]);
  });
});
