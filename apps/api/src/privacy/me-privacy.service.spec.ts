import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DELETION_GRACE_DAYS, MePrivacyService } from './me-privacy.service';

const mockWriteAuditLog = jest.fn();
jest.mock('../common/audit/write-audit-log', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['member'],
  plan: 'starter',
};

const basePerson = {
  id: 'person-1',
  full_name: 'Ana',
  phone: '119',
  email: 'ana@x.fake',
  birth_date: null,
  gender: null,
  marital_status: null,
  profession: null,
  address_street: null,
  address_number: null,
  address_complement: null,
  address_neighborhood: null,
  address_city: null,
  address_state: null,
  address_zip: null,
  photo_url: null,
  baptism_date: null,
  membership_date: null,
  classification: 'member',
  created_at: new Date('2026-01-01'),
  deleted_at: null as Date | null,
  anonymized_at: null as Date | null,
};

function setup(
  opts: { personId?: string | null; person?: Partial<typeof basePerson> | null } = {},
) {
  const person = opts.person === null ? null : { ...basePerson, ...opts.person };
  const client = {
    userAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.personId === null ? { person_id: null } : { person_id: opts.personId ?? 'person-1' }),
    },
    person: {
      findUnique: jest.fn().mockResolvedValue(person),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...person, ...data })),
    },
    consentRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    classificationHistory: { findMany: jest.fn().mockResolvedValue([]) },
    groupMembership: {
      findMany: jest.fn().mockResolvedValue([
        { small_group_id: 'g1', role: 'member', joined_at: new Date(), smallGroup: { name: 'Célula Norte' } },
      ]),
    },
    visitRecord: { findMany: jest.fn().mockResolvedValue([]) },
    financialTransaction: {
      findMany: jest.fn().mockResolvedValue([
        {
          occurred_at: new Date(),
          amount: new Prisma.Decimal(150),
          description: 'Dízimo',
          status: 'confirmed',
          category: { name: 'Dízimos' },
        },
      ]),
    },
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new MePrivacyService(prisma), client };
}

beforeEach(() => {
  mockWriteAuditLog.mockReset().mockResolvedValue(undefined);
});

describe('MePrivacyService — quem é o titular', () => {
  it('resolve a pessoa pela conta do token, nunca por id de fora', async () => {
    const { service, client } = setup();
    await service.personalData(user);
    expect(client.userAccount.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { person_id: true },
    });
    expect(client.person.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'person-1' } }),
    );
  });

  it('conta sem pessoa vinculada: 404', async () => {
    const { service } = setup({ personId: null });
    await expect(service.personalData(user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pessoa vinculada que não existe mais: 404', async () => {
    const { service } = setup({ person: null });
    await expect(service.personalData(user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pessoa já anonimizada: 409, nada a mostrar nem a cancelar', async () => {
    const { service } = setup({ person: { anonymized_at: new Date() } });
    await expect(service.personalData(user)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('personalData / exportData', () => {
  it('monta o relatório sem os marcadores internos e com doações formatadas', async () => {
    const { service } = setup();
    const data = await service.personalData(user);

    expect(data.person).not.toHaveProperty('deleted_at');
    expect(data.person).not.toHaveProperty('anonymized_at');
    expect(data.groups).toEqual([
      expect.objectContaining({ small_group_id: 'g1', name: 'Célula Norte', role: 'member' }),
    ]);
    expect(data.donations[0]).toMatchObject({ amount: '150.00', category: 'Dízimos' });
    expect(data.deletion).toEqual({ requested_at: null, anonymize_after: null });
  });

  it('não religa doação anônima ao titular', async () => {
    const { service, client } = setup();
    await service.personalData(user);
    expect(client.financialTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { donor_person_id: 'person-1', is_anonymous: false } }),
    );
  });

  it('com pedido de exclusão em aberto, informa a data da anonimização', async () => {
    const requested = new Date('2026-10-01T12:00:00Z');
    const { service } = setup({ person: { deleted_at: requested } });
    const data = await service.personalData(user);
    const expected = new Date(requested);
    expected.setDate(expected.getDate() + DELETION_GRACE_DAYS);
    expect(data.deletion).toEqual({ requested_at: requested, anonymize_after: expected });
  });

  it('exportação é versionada e auditada', async () => {
    const { service } = setup();
    const doc = await service.exportData(user);
    expect(doc.format).toBe('orbien.personal-data.v1');
    expect(doc.exported_at).toBeInstanceOf(Date);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'person.data_exported', subject_person_id: 'person-1' }),
      expect.anything(),
    );
  });
});

describe('updateMyData', () => {
  it('grava só os campos enviados, apara espaços e audita antes/depois', async () => {
    const { service, client } = setup();
    await service.updateMyData({ phone: ' 11988887777 ', address_city: '' }, user);

    expect(client.person.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'person-1' },
        data: { phone: '11988887777', address_city: null },
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'person.self_updated',
        before: { phone: '119', address_city: null },
        after: { phone: '11988887777', address_city: null },
      }),
      expect.anything(),
    );
  });

  it('valor que não é texto (data, null) vai como veio', async () => {
    const { service, client } = setup();
    const birth = new Date('1990-05-01');
    await service.updateMyData({ birth_date: birth, phone: null }, user);
    expect(client.person.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phone: null, birth_date: birth } }),
    );
  });

  it('nome vazio não apaga o nome', async () => {
    const { service, client } = setup();
    const result = await service.updateMyData({ full_name: '   ' }, user);
    expect(client.person.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ full_name: 'Ana' });
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});

describe('revokeConsent', () => {
  it('revoga os aceites ativos da versão e audita', async () => {
    const { service, client } = setup();
    await expect(service.revokeConsent('member_consent_v1', user)).resolves.toEqual({ revoked: 1 });
    expect(client.consentRecord.updateMany).toHaveBeenCalledWith({
      where: { person_id: 'person-1', version: 'member_consent_v1', revoked_at: null },
      data: { revoked_at: expect.any(Date), revocation_reason: 'Revogado pelo titular' },
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'consent.revoked' }),
      expect.anything(),
    );
  });

  it('sem aceite ativo da versão: 404 e nada auditado', async () => {
    const { service, client } = setup();
    client.consentRecord.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.revokeConsent('x', user)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });
});

describe('pedido de exclusão', () => {
  it('marca deleted_at e audita o pedido', async () => {
    const { service, client } = setup();
    const status = await service.requestDeletion(user);
    expect(client.person.update).toHaveBeenCalledWith({
      where: { id: 'person-1' },
      data: { deleted_at: expect.any(Date) },
    });
    expect(status.requested_at).toBeInstanceOf(Date);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'person.deletion_requested' }),
      expect.anything(),
    );
  });

  it('pedido repetido devolve o que já existe, sem reiniciar o prazo', async () => {
    const requested = new Date('2026-10-01T12:00:00Z');
    const { service, client } = setup({ person: { deleted_at: requested } });
    const status = await service.requestDeletion(user);
    expect(status.requested_at).toBe(requested);
    expect(client.person.update).not.toHaveBeenCalled();
  });

  it('cancelar limpa deleted_at e audita', async () => {
    const { service, client } = setup({ person: { deleted_at: new Date() } });
    await expect(service.cancelDeletion(user)).resolves.toEqual({
      requested_at: null,
      anonymize_after: null,
    });
    expect(client.person.update).toHaveBeenCalledWith({
      where: { id: 'person-1' },
      data: { deleted_at: null },
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'person.deletion_cancelled' }),
      expect.anything(),
    );
  });

  it('cancelar sem pedido em aberto: 404', async () => {
    const { service } = setup();
    await expect(service.cancelDeletion(user)).rejects.toBeInstanceOf(NotFoundException);
  });
});
