import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { KidsGuardiansService } from './kids-guardians.service';
import type { KidsActor } from './kids-child-access.service';
import { PrismaService } from '../../prisma/prisma.service';

const actor: KidsActor = { userId: 'u1', tenantId: 't1', congregationId: 'g1', roles: ['member'] };

function setup() {
  const client = {
    person: { findFirst: jest.fn(), create: jest.fn() },
    kidsGuardian: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const access = {
    assertCanAccess: jest.fn().mockResolvedValue({ id: 'child1' }),
    isManager: jest.fn((roles: string[]) => roles.includes('ministry_leader')),
    ownPersonId: jest.fn().mockResolvedValue('mae'),
  };
  client.person.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p-new', ...data }));
  client.kidsGuardian.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'kg1', ...data }));
  const service = new KidsGuardiansService(
    { client, runInTx: jest.fn((fn: (tx: unknown) => unknown) => fn(client)) } as unknown as PrismaService,
    access as never,
  );
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

describe('KidsGuardiansService.update', () => {
  const row = (extra = {}) => ({
    id: 'kg-avo',
    child_id: 'child1',
    guardian_person_id: 'avo',
    relationship: 'avó',
    can_pickup: true,
    is_primary: false,
    ...extra,
  });
  const mae = { id: 'kg-mae', guardian_person_id: 'mae', is_primary: true };
  const leader: KidsActor = { userId: 'l1', tenantId: 't1', congregationId: 'g1', roles: ['ministry_leader'] };

  // findFirst: 1ª chamada = a linha editada; 2ª = a linha do ator como responsável da criança.
  function ready(target = row(), actorRow: object | null = mae) {
    const ctx = setup();
    ctx.client.kidsGuardian.findFirst.mockResolvedValueOnce(target).mockResolvedValueOnce(actorRow);
    ctx.client.kidsGuardian.update.mockImplementation(async ({ data }: { data: object }) => ({ ...target, ...data }));
    ctx.client.kidsGuardian.count.mockResolvedValue(1);
    return ctx;
  }

  it('o responsável primário altera parentesco e permissão de retirada', async () => {
    const { client, service } = ready();
    const out = await service.update(actor, 'kg-avo', { can_pickup: false, relationship: 'vizinha' });

    expect(client.kidsGuardian.findFirst.mock.calls[0][0].where).toEqual({ id: 'kg-avo', tenant_id: 't1', congregation_id: 'g1' });
    expect(client.kidsGuardian.update).toHaveBeenCalledWith({
      where: { id: 'kg-avo' },
      data: { can_pickup: false, relationship: 'vizinha' },
    });
    expect(client.kidsGuardian.updateMany).not.toHaveBeenCalled();
    expect(out).toMatchObject({ can_pickup: false, relationship: 'vizinha' });
  });

  it('marcar outro como primário rebaixa os anteriores na mesma transação', async () => {
    const { client, service } = ready();
    const order: string[] = [];
    client.kidsGuardian.updateMany.mockImplementation(async () => void order.push('demote'));
    client.kidsGuardian.update.mockImplementation(async ({ data }: { data: object }) => {
      order.push('promote');
      return { ...row(), ...data };
    });
    await service.update(actor, 'kg-avo', { is_primary: true });

    expect(client.kidsGuardian.updateMany).toHaveBeenCalledWith({
      where: { child_id: 'child1', is_primary: true, id: { not: 'kg-avo' } },
      data: { is_primary: false },
    });
    expect(order).toEqual(['demote', 'promote']);
    expect(client.$queryRaw).toHaveBeenCalled(); // trava as linhas da criança
  });

  it('rebaixar o único primário: 422 e nada é gravado', async () => {
    const { client, service } = ready(row({ id: 'kg-mae', guardian_person_id: 'mae', is_primary: true }));
    client.kidsGuardian.count.mockResolvedValue(0);

    await expect(service.update(actor, 'kg-mae', { is_primary: false })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(client.kidsGuardian.update).not.toHaveBeenCalled();
  });

  it('o primário não pode perder o direito de retirar (já primário, can_pickup=false): 400', async () => {
    const { client, service } = ready(row({ is_primary: true }));
    await expect(service.update(actor, 'kg-avo', { can_pickup: false })).rejects.toBeInstanceOf(BadRequestException);
    expect(client.kidsGuardian.update).not.toHaveBeenCalled();
  });

  it('promover quem não retira, sem devolver o direito na mesma chamada: 400', async () => {
    const { service } = ready(row({ can_pickup: false }));
    await expect(service.update(actor, 'kg-avo', { is_primary: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('corpo vazio ou parentesco em branco: 400', async () => {
    const { service } = ready();
    await expect(service.update(actor, 'kg-avo', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(actor, 'kg-avo', { relationship: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('quem não é responsável primário da criança (só do Household ou autorizado comum): 403', async () => {
    const { client, service } = ready(row(), null);
    await expect(service.update(actor, 'kg-avo', { relationship: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    // A busca da linha do ator exige is_primary: um autorizado comum não a encontra.
    expect(client.kidsGuardian.findFirst.mock.calls[1][0].where).toEqual({
      child_id: 'child1',
      guardian_person_id: 'mae',
      is_primary: true,
    });
    expect(client.kidsGuardian.update).not.toHaveBeenCalled();
  });

  it('conta sem cadastro de pessoa: 403', async () => {
    const { access, service } = ready();
    access.ownPersonId.mockResolvedValue(null);
    await expect(service.update(actor, 'kg-avo', { relationship: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a gestão edita sem ser responsável', async () => {
    const { client, service } = ready();
    await service.update(leader, 'kg-avo', { relationship: 'tia' });
    expect(client.kidsGuardian.update).toHaveBeenCalled();
    expect(client.kidsGuardian.findFirst).toHaveBeenCalledTimes(1); // não procura a linha do ator
  });

  it('autorizado inexistente na congregação: 404', async () => {
    const { client, service } = setup();
    client.kidsGuardian.findFirst.mockResolvedValue(null);
    await expect(service.update(actor, 'x', { relationship: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('criança alheia: o 404 do acesso propaga, nada gravado', async () => {
    const { client, access, service } = ready();
    access.assertCanAccess.mockRejectedValue(new NotFoundException());
    await expect(service.update(actor, 'kg-avo', { relationship: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(client.kidsGuardian.update).not.toHaveBeenCalled();
  });
});
