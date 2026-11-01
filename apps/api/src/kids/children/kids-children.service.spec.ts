import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { KidsChildrenService } from './kids-children.service';
import type { KidsActor } from './kids-child-access.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockWriteAuditLog = jest.fn();
jest.mock('../../common/audit/write-audit-log', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

beforeEach(() => mockWriteAuditLog.mockReset().mockResolvedValue(undefined));

const resp: KidsActor = { userId: 'u-resp', tenantId: 't1', congregationId: 'g1', roles: ['member'] };
const sec: KidsActor = { userId: 'u-sec', tenantId: 't1', congregationId: 'g1', roles: ['secretary'] };

const past = (years: number) => new Date(Date.now() - years * 365.25 * 86_400_000);
const dto = (extra: Record<string, unknown> = {}) => ({
  full_name: 'Ana Souza',
  birth_date: past(4),
  ...extra,
});

function setup() {
  const client = {
    person: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    household: { create: jest.fn() },
    householdMember: { findFirst: jest.fn(), create: jest.fn() },
    kidsGuardian: { create: jest.fn() },
    kidsChildHealth: { upsert: jest.fn(), findUnique: jest.fn() },
  };
  const access = {
    isManager: jest.fn((roles: string[]) => roles.includes('secretary') || roles.includes('pastor')),
    requireOwnPersonId: jest.fn().mockResolvedValue('p-resp'),
    assertCanAccess: jest.fn(),
  };
  const consent = {
    hasValidConsent: jest.fn().mockResolvedValue(true),
    assertValidConsent: jest.fn().mockResolvedValue(undefined),
    grant: jest.fn().mockResolvedValue({ id: 'c1' }),
  };
  // Padrões felizes: o responsável existe e já tem Household.
  client.person.findFirst.mockResolvedValue({ id: 'p-resp', household_id: 'h1', full_name: 'Maria Souza' });
  client.householdMember.findFirst.mockResolvedValue({ household_id: 'h1' });
  client.person.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'child1',
    ...data,
  }));
  const guardians = { list: jest.fn().mockResolvedValue([]) };
  const prisma = { client } as unknown as PrismaService;
  const service = new KidsChildrenService(prisma, access as never, consent as never, guardians as never);
  return { client, access, consent, guardians, prisma, service };
}

describe('KidsChildrenService.create', () => {
  it('responsável logado: cria Person is_child sem conta, no Household dele, como filho (AC 1)', async () => {
    const { client, service } = setup();

    const result = await service.create(resp, dto({ allergies: 'amendoim' }));

    const data = client.person.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenant_id: 't1',
      congregation_id: 'g1',
      full_name: 'Ana Souza',
      is_child: true,
      household_id: 'h1',
    });
    expect(data.birth_date).toBeInstanceOf(Date);
    expect(client.householdMember.create).toHaveBeenCalledWith({
      data: { household_id: 'h1', person_id: 'child1', role: 'child' },
    });
    expect(result).toMatchObject({ id: 'child1', full_name: 'Ana Souza' });
    // A resposta de escrita não devolve saúde: a leitura é da ficha, auditada.
    expect(result).not.toHaveProperty('allergies');
    expect(result).not.toHaveProperty('medical_notes');
  });

  it('o dado de saúde não vai para Person: grava na tabela própria', async () => {
    const { client, service } = setup();

    await service.create(resp, dto({ allergies: 'amendoim', medical_notes: 'asma' }));

    expect(client.person.create.mock.calls[0][0].data).not.toHaveProperty('allergies');
    expect(client.person.create.mock.calls[0][0].data).not.toHaveProperty('medical_notes');
    expect(client.kidsChildHealth.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { person_id: 'child1' },
        create: expect.objectContaining({
          tenant_id: 't1',
          congregation_id: 'g1',
          person_id: 'child1',
          allergies: 'amendoim',
          medical_notes: 'asma',
        }),
      }),
    );
  });

  it('sem alergia nem observação, não cria linha de saúde', async () => {
    const { client, service } = setup();

    await service.create(resp, dto());

    expect(client.kidsChildHealth.upsert).not.toHaveBeenCalled();
  });

  it('quem cadastra vira responsável primário, com o parentesco informado', async () => {
    const { client, service } = setup();

    await service.create(resp, dto({ relationship: 'mãe' }));

    expect(client.kidsGuardian.create).toHaveBeenCalledWith({
      data: {
        tenant_id: 't1',
        congregation_id: 'g1',
        child_id: 'child1',
        guardian_person_id: 'p-resp',
        relationship: 'mãe',
        can_pickup: true,
        is_primary: true,
      },
    });
  });

  it('sem Household, cria um com o responsável como head e a criança como child', async () => {
    const { client, service } = setup();
    client.person.findFirst.mockResolvedValue({ id: 'p-resp', household_id: null, full_name: 'Maria Souza' });
    client.householdMember.findFirst.mockResolvedValue(null);
    client.household.create.mockResolvedValue({ id: 'h-new' });

    await service.create(resp, dto());

    expect(client.household.create).toHaveBeenCalledWith({
      data: { tenant_id: 't1', congregation_id: 'g1', name: expect.stringContaining('Souza') },
    });
    expect(client.householdMember.create).toHaveBeenCalledWith({
      data: { household_id: 'h-new', person_id: 'p-resp', role: 'head' },
    });
    expect(client.householdMember.create).toHaveBeenCalledWith({
      data: { household_id: 'h-new', person_id: 'child1', role: 'child' },
    });
    expect(client.person.update).toHaveBeenCalledWith({ where: { id: 'p-resp' }, data: { household_id: 'h-new' } });
    expect(client.person.create.mock.calls[0][0].data.household_id).toBe('h-new');
  });

  it('responsável sem Person vinculada (404/403 do acesso): propaga e nada é criado', async () => {
    const { client, access, service } = setup();
    access.requireOwnPersonId.mockRejectedValue(new ForbiddenException('Conta sem cadastro de pessoa vinculado'));

    await expect(service.create(resp, dto())).rejects.toBeInstanceOf(ForbiddenException);
    // Gestão sem guardian_person_id informado também não escapa: não há quem seja o responsável.
    await expect(service.create(sec, dto())).rejects.toBeInstanceOf(ForbiddenException);
    expect(client.person.create).not.toHaveBeenCalled();
  });

  it('a gestão sem Person na conta cadastra no lugar do responsável informado', async () => {
    const { client, access, service } = setup();
    access.requireOwnPersonId.mockRejectedValue(new ForbiddenException('Conta sem cadastro de pessoa vinculado'));
    client.person.findFirst.mockResolvedValue({ id: 'p-outro', household_id: 'h9', full_name: 'João Lima' });

    await service.create(sec, dto({ guardian_person_id: 'p-outro' }));

    expect(client.kidsGuardian.create.mock.calls[0][0].data.guardian_person_id).toBe('p-outro');
  });

  it('responsável sem household_id mas com participação em um Household: reaproveita, não cria outro', async () => {
    const { client, service } = setup();
    client.person.findFirst.mockResolvedValue({ id: 'p-resp', household_id: null, full_name: 'Maria Souza' });
    client.householdMember.findFirst.mockResolvedValue({ household_id: 'h-existente' });

    await service.create(resp, dto());

    expect(client.household.create).not.toHaveBeenCalled();
    expect(client.person.create.mock.calls[0][0].data.household_id).toBe('h-existente');
  });

  it('responsável com nome de uma palavra só: o Household leva o próprio nome', async () => {
    const { client, service } = setup();
    client.person.findFirst.mockResolvedValue({ id: 'p-resp', household_id: null, full_name: ' Maria ' });
    client.householdMember.findFirst.mockResolvedValue(null);
    client.household.create.mockResolvedValue({ id: 'h-new' });

    await service.create(resp, dto());

    expect(client.household.create).toHaveBeenCalledWith({
      data: { tenant_id: 't1', congregation_id: 'g1', name: 'Família Maria' },
    });
  });

  it('sem consentimento vigente: 422 e nada é criado (AC 2)', async () => {
    const { client, consent, service } = setup();
    consent.assertValidConsent.mockRejectedValue(new UnprocessableEntityException({ code: 'kids_consent_required' }));

    await expect(service.create(resp, dto())).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(consent.assertValidConsent).toHaveBeenCalledWith('p-resp');
    expect(client.person.create).not.toHaveBeenCalled();
  });

  it('secretaria no lugar do responsável: registra o consentimento (secretaria) ANTES de salvar (AC 7)', async () => {
    const { client, consent, service } = setup();
    client.person.findFirst.mockResolvedValue({ id: 'p-outro', household_id: 'h9', full_name: 'João Lima' });
    consent.hasValidConsent.mockResolvedValue(false);

    await service.create(sec, dto({ guardian_person_id: 'p-outro', register_consent: true }));

    expect(consent.grant).toHaveBeenCalledWith('t1', 'g1', 'p-outro', 'secretaria', expect.any(Object));
    expect(consent.grant.mock.invocationCallOrder[0]).toBeLessThan(client.person.create.mock.invocationCallOrder[0]);
    expect(client.kidsGuardian.create.mock.calls[0][0].data.guardian_person_id).toBe('p-outro');
  });

  it('secretaria sem consentimento vigente e sem registrá-lo: 422 e nada é criado (AC 7)', async () => {
    const { client, consent, service } = setup();
    client.person.findFirst.mockResolvedValue({ id: 'p-outro', household_id: 'h9', full_name: 'João Lima' });
    consent.hasValidConsent.mockResolvedValue(false);
    consent.assertValidConsent.mockRejectedValue(new UnprocessableEntityException({ code: 'kids_consent_required' }));

    await expect(service.create(sec, dto({ guardian_person_id: 'p-outro' }))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(consent.grant).not.toHaveBeenCalled();
    expect(client.person.create).not.toHaveBeenCalled();
  });

  it('secretaria com o responsável já consentido não registra de novo', async () => {
    const { consent, client, service } = setup();
    client.person.findFirst.mockResolvedValue({ id: 'p-outro', household_id: 'h9', full_name: 'João Lima' });

    await service.create(sec, dto({ guardian_person_id: 'p-outro', register_consent: true }));

    expect(consent.grant).not.toHaveBeenCalled();
  });

  it('quem não é da gestão não cadastra no lugar de outra pessoa: 403', async () => {
    const { client, service } = setup();

    await expect(service.create(resp, dto({ guardian_person_id: 'p-outro' }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.person.create).not.toHaveBeenCalled();
  });

  it('responsável informado que não existe na congregação: 404', async () => {
    const { client, service } = setup();
    client.person.findFirst.mockResolvedValue(null);

    await expect(service.create(sec, dto({ guardian_person_id: 'p-x' }))).rejects.toBeInstanceOf(NotFoundException);
    expect(client.person.create).not.toHaveBeenCalled();
  });

  it('nascimento no futuro ou de maior de 18 anos: 400', async () => {
    const { service } = setup();

    await expect(service.create(resp, dto({ birth_date: new Date(Date.now() + 86_400_000) }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create(resp, dto({ birth_date: past(19) }))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('KidsChildrenService.update', () => {
  const child = { id: 'child1', tenant_id: 't1', congregation_id: 'g1', full_name: 'Ana Souza' };

  it('o acesso é checado antes; criança alheia (404) não é alterada', async () => {
    const { client, access, service } = setup();
    access.assertCanAccess.mockRejectedValue(new NotFoundException('Criança não encontrada'));

    await expect(service.update(resp, 'child1', { full_name: 'Outro' })).rejects.toBeInstanceOf(NotFoundException);

    expect(client.person.update).not.toHaveBeenCalled();
    expect(client.kidsChildHealth.upsert).not.toHaveBeenCalled();
  });

  it('atualiza nome e nascimento na Person e a saúde na tabela própria', async () => {
    const { client, access, service } = setup();
    access.assertCanAccess.mockResolvedValue(child);
    client.person.update.mockResolvedValue({ ...child, full_name: 'Ana S.' });

    await service.update(resp, 'child1', { full_name: 'Ana S.', allergies: 'leite', medical_notes: null });

    expect(client.person.update).toHaveBeenCalledWith({ where: { id: 'child1' }, data: { full_name: 'Ana S.' } });
    expect(client.kidsChildHealth.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { person_id: 'child1' },
        update: { allergies: 'leite', medical_notes: null },
      }),
    );
  });

  it('só o nome: grava na Person e não cria linha de saúde', async () => {
    const { client, access, service } = setup();
    access.assertCanAccess.mockResolvedValue(child);
    client.person.update.mockResolvedValue({ ...child, full_name: 'Ana S.' });

    await service.update(resp, 'child1', { full_name: 'Ana S.' });

    expect(client.person.update).toHaveBeenCalledWith({ where: { id: 'child1' }, data: { full_name: 'Ana S.' } });
    expect(client.kidsChildHealth.upsert).not.toHaveBeenCalled();
  });

  it('só o nascimento: grava a data na Person', async () => {
    const { client, access, service } = setup();
    access.assertCanAccess.mockResolvedValue(child);
    client.person.update.mockResolvedValue(child);
    const birth = past(5);

    await service.update(resp, 'child1', { birth_date: birth });

    expect(client.person.update).toHaveBeenCalledWith({ where: { id: 'child1' }, data: { birth_date: birth } });
  });

  it('só saúde: não mexe na Person', async () => {
    const { client, access, service } = setup();
    access.assertCanAccess.mockResolvedValue(child);

    await service.update(resp, 'child1', { allergies: 'leite' });

    expect(client.person.update).not.toHaveBeenCalled();
    expect(client.kidsChildHealth.upsert).toHaveBeenCalled();
  });

  it('nascimento futuro: 400', async () => {
    const { access, service } = setup();
    access.assertCanAccess.mockResolvedValue(child);

    await expect(
      service.update(resp, 'child1', { birth_date: new Date(Date.now() + 86_400_000) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('KidsChildrenService.getFicha — leitura de saúde auditada (AC 5, AD-013)', () => {
  const equipe: KidsActor = { userId: 'u-pastor', tenantId: 't1', congregationId: 'g1', roles: ['pastor'] };
  const child = { id: 'child1', full_name: 'Ana Souza', birth_date: null, household_id: 'h1' };

  function withHealth() {
    const ctx = setup();
    ctx.access.assertCanAccess.mockResolvedValue(child);
    ctx.client.kidsChildHealth.findUnique.mockResolvedValue({ allergies: 'amendoim', medical_notes: 'asma' });
    ctx.guardians.list.mockResolvedValue([{ id: 'kg1', full_name: 'Maria', is_primary: true }]);
    return ctx;
  }

  it('devolve alergias, observações e responsáveis', async () => {
    const { service } = withHealth();

    const ficha = await service.getFicha(equipe, 'child1');

    expect(ficha).toMatchObject({
      id: 'child1',
      allergies: 'amendoim',
      medical_notes: 'asma',
      guardians: [{ id: 'kg1' }],
    });
  });

  it('leitura pela equipe grava auditoria com quem/qual criança — e NUNCA o conteúdo', async () => {
    const { service, prisma } = withHealth();

    await service.getFicha(equipe, 'child1');

    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    const [client, entry] = mockWriteAuditLog.mock.calls[0];
    expect(client).toBe(prisma);
    expect(entry).toMatchObject({
      tenant_id: 't1',
      congregation_id: 'g1',
      actor_user_id: 'u-pastor',
      subject_person_id: 'child1',
      action: 'kids.health_read',
    });
    expect(JSON.stringify(entry)).not.toMatch(/amendoim|asma/);
    expect(entry.before).toBeUndefined();
    expect(entry.after).toBeUndefined();
  });

  it('o responsável lendo o próprio filho não é auditado como acesso da equipe', async () => {
    const { service } = withHealth();

    await service.getFicha(resp, 'child1');

    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it('sem acesso à criança (404), não lê saúde nem audita', async () => {
    const { service, access, client } = withHealth();
    access.assertCanAccess.mockRejectedValue(new NotFoundException('Criança não encontrada'));

    await expect(service.getFicha(resp, 'child1')).rejects.toBeInstanceOf(NotFoundException);
    expect(client.kidsChildHealth.findUnique).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it('as respostas de escrita (PATCH) não devolvem saúde — a equipe não lê sem rastro', async () => {
    const { service, access, client } = withHealth();
    access.assertCanAccess.mockResolvedValue(child);
    client.kidsChildHealth.upsert.mockResolvedValue({ allergies: 'amendoim', medical_notes: 'asma' });

    const result = await service.update(equipe, 'child1', { allergies: 'amendoim' });

    expect(result).not.toHaveProperty('allergies');
    expect(result).not.toHaveProperty('medical_notes');
  });
});

describe('KidsChildrenService.list', () => {
  const equipe: KidsActor = { userId: 'u-pastor', tenantId: 't1', congregationId: 'g1', roles: ['pastor'] };

  it('responsável: só crianças do próprio Household, sem saúde na seleção', async () => {
    const { client, service } = setup();
    client.person.findMany.mockResolvedValue([]);

    await service.list(resp, {});

    const arg = client.person.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      tenant_id: 't1',
      congregation_id: 'g1',
      is_child: true,
      householdMemberships: {
        some: { role: 'child', household: { members: { some: { person_id: 'p-resp', role: { not: 'child' } } } } },
      },
    });
    expect(JSON.stringify(arg.select)).not.toMatch(/allerg|medical/);
  });

  it('equipe: busca por nome na congregação, só crianças, limitada', async () => {
    const { client, service } = setup();
    client.person.findMany.mockResolvedValue([]);

    await service.list(equipe, { search: 'ana', limit: 10 });

    const arg = client.person.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      tenant_id: 't1',
      congregation_id: 'g1',
      is_child: true,
      deleted_at: null,
      full_name: { contains: 'ana', mode: 'insensitive' },
    });
    expect(arg.where).not.toHaveProperty('householdMemberships');
    expect(arg.take).toBe(10);
  });
});
