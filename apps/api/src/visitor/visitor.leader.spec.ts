import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { maskName, normalizePhone, VisitorService } from './visitor.service';
import { VisitorLeaderController, VISITOR_LEADER_ROLES } from './visitor.leader.controller';
import { RegisterVisitorByLeaderDto } from './dto/register-visitor-by-leader.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from '../persons/classification.service';
import { VisitsService } from '../persons/visits.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const mockWriteAuditLog = jest.fn();
jest.mock('../common/audit/write-audit-log', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

beforeEach(() => mockWriteAuditLog.mockReset().mockResolvedValue(undefined));

const leader: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['cell_leader'],
  plan: 'starter',
};

function setup() {
  const tx = {
    person: { create: jest.fn().mockResolvedValue({ id: 'new-1', full_name: 'Ana' }) },
    consentRecord: { create: jest.fn().mockResolvedValue({}) },
    visitRecord: { create: jest.fn().mockResolvedValue({}) },
  };
  const client = {
    person: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    client,
    runInTx: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;
  const checkAuto = jest.fn().mockResolvedValue(false);
  const service = new VisitorService(
    prisma,
    { checkAutoReclassification: checkAuto } as unknown as ClassificationService,
    {} as VisitsService,
  );
  return { service, tx, client, checkAuto };
}

const base = { full_name: 'Ana', origin: 'service' as const, lgpd_consent: true as const };

describe('normalizePhone', () => {
  it('deixa só dígitos e preserva o + inicial', () => {
    expect(normalizePhone('(11) 99999-0000')).toBe('11999990000');
    expect(normalizePhone(' +55 11 9999 ')).toBe('+55119999');
  });
});

describe('maskName', () => {
  it('primeiro nome e a inicial do último', () => {
    expect(maskName('André da Costa')).toBe('André C.');
    expect(maskName('  Ana  ')).toBe('Ana');
  });
});

describe('VisitorService.registerByLeader', () => {
  it('origem small_group sem grupo: 400', async () => {
    const { service } = setup();
    await expect(
      service.registerByLeader({ ...base, origin: 'small_group' } as never, leader),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('para a secretaria, o duplicado vem completo', async () => {
    const { service, client } = setup();
    client.person.findMany.mockResolvedValue([
      { id: 'p0', full_name: 'Ana Souza', classification: 'member', _count: { visitRecords: 2 }, visitRecords: [] },
    ]);
    const result = await service.registerByLeader(
      { ...base, phone: '119' } as never,
      { ...leader, roles: ['secretary'] },
    );
    expect(result).toEqual({
      status: 'duplicate',
      matches: [{ id: 'p0', full_name: 'Ana Souza', classification: 'member', visits: 2, last_visit_at: null }],
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ after: { matched_person_ids: ['p0'], masked: false } }),
      expect.anything(),
    );
  });

  it('para o líder de célula, telefone repetido devolve o duplicado reduzido, auditado, sem criar', async () => {
    const { service, client, tx } = setup();
    const last = new Date('2026-09-01');
    client.person.findMany.mockResolvedValue([
      {
        id: 'p0',
        full_name: 'Ana S.',
        classification: 'attendee',
        _count: { visitRecords: 4 },
        visitRecords: [{ visited_at: last }],
      },
      { id: 'p9', full_name: 'Ana T.', classification: 'visitor', _count: { visitRecords: 0 }, visitRecords: [] },
    ]);

    const result = await service.registerByLeader({ ...base, phone: '(11) 99999-0000' } as never, leader);

    expect(client.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phone: { in: ['11999990000', '(11) 99999-0000'] } }),
      }),
    );
    expect(result).toEqual({
      status: 'duplicate',
      matches: [
        { id: 'p0', full_name: 'Ana S.', classification: null, visits: 4, last_visit_at: last },
        { id: 'p9', full_name: 'Ana T.', classification: null, visits: 0, last_visit_at: null },
      ],
    });
    expect(tx.person.create).not.toHaveBeenCalled();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'visitor.duplicate_lookup',
        actor_user_id: 'user-1',
        after: { matched_person_ids: ['p0', 'p9'], masked: true },
      }),
      expect.anything(),
    );
  });

  it('sem duplicado, cria visitante com consentimento, visita e reclassificação', async () => {
    const { service, tx, checkAuto } = setup();
    checkAuto.mockResolvedValue(true);

    const result = await service.registerByLeader(
      { ...base, full_name: ' Ana ', phone: '11 9999', email: ' a@b.fake ', small_group_id: undefined } as never,
      leader,
    );

    expect(result).toEqual({ status: 'registered', person: { id: 'new-1', full_name: 'Ana' }, reclassified: true });
    expect(tx.person.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          full_name: 'Ana',
          phone: '119999',
          email: 'a@b.fake',
          gender: null,
          classification: 'visitor',
          congregation_id: 'cong-1',
        }),
      }),
    );
    expect(tx.consentRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ person_id: 'new-1', version: 'visitor_consent_v1', origin: 'service' }),
    });
    expect(tx.visitRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ person_id: 'new-1', origin: 'service', small_group_id: null }),
    });
    expect(checkAuto).toHaveBeenCalledWith('new-1', 'user-1', tx);
  });

  it('sem telefone nem e-mail, cria sem procurar duplicado', async () => {
    const { service, client, tx } = setup();
    await service.registerByLeader({ ...base, gender: 'female' } as never, leader);
    expect(client.person.findMany).not.toHaveBeenCalled();
    expect(tx.person.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: null, email: null, gender: 'female' }) }),
    );
  });

  it('force_new cria mesmo com telefone repetido', async () => {
    const { service, client, tx } = setup();
    await service.registerByLeader({ ...base, phone: '119', force_new: true } as never, leader);
    expect(client.person.findMany).not.toHaveBeenCalled();
    expect(tx.person.create).toHaveBeenCalled();
  });

  it('existing_person_id registra só a visita, no grupo informado', async () => {
    const { service, client, tx } = setup();
    client.person.findFirst.mockResolvedValue({ id: 'p0', full_name: 'Ana S.' });

    const result = await service.registerByLeader(
      { existing_person_id: 'p0', origin: 'small_group', small_group_id: 'g1', lgpd_consent: true } as never,
      leader,
    );

    expect(result).toEqual({ status: 'visit_recorded', person: { id: 'p0', full_name: 'Ana S.' }, reclassified: false });
    expect(tx.person.create).not.toHaveBeenCalled();
    expect(tx.visitRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ person_id: 'p0', small_group_id: 'g1' }),
    });
  });

  it('existing_person_id que não existe (ou foi anonimizado): 404', async () => {
    const { service, client } = setup();
    client.person.findFirst.mockResolvedValue(null);
    await expect(
      service.registerByLeader({ existing_person_id: 'p0', origin: 'service', lgpd_consent: true } as never, leader),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('VisitorLeaderController', () => {
  it('abre ao líder de célula e repassa ao serviço', async () => {
    expect(VISITOR_LEADER_ROLES).toContain('cell_leader');
    expect(VISITOR_LEADER_ROLES).not.toContain('member');
    const service = { registerByLeader: jest.fn().mockResolvedValue('ok') };
    const controller = new VisitorLeaderController(service as unknown as VisitorService);
    await expect(controller.register(base as never, leader)).resolves.toBe('ok');
    expect(service.registerByLeader).toHaveBeenCalledWith(base, leader);
  });
});

describe('RegisterVisitorByLeaderDto', () => {
  const errorsFor = (payload: Record<string, unknown>) =>
    validate(plainToInstance(RegisterVisitorByLeaderDto, payload));

  it('aceita o cadastro mínimo', async () => {
    expect(await errorsFor(base)).toHaveLength(0);
  });

  it('exige consentimento verdadeiro', async () => {
    expect((await errorsFor({ ...base, lgpd_consent: false })).length).toBeGreaterThan(0);
  });

  it('exige nome, salvo quando é a mesma pessoa', async () => {
    expect((await errorsFor({ origin: 'service', lgpd_consent: true })).length).toBeGreaterThan(0);
    expect(
      await errorsFor({
        origin: 'service',
        lgpd_consent: true,
        existing_person_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      }),
    ).toHaveLength(0);
  });

  it('origem small_group exige o grupo', async () => {
    expect((await errorsFor({ ...base, origin: 'small_group' })).length).toBeGreaterThan(0);
  });
});
