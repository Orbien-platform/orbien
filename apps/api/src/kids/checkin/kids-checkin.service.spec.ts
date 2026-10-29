import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { KidsCheckinService, ageInMonths } from './kids-checkin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor } from '../children/kids-child-access.service';
import * as audit from '../../common/audit/write-audit-log';

jest.mock('../../common/audit/write-audit-log', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));
const writeAuditLog = audit.writeAuditLog as jest.Mock;

const NOW = new Date('2026-10-26T15:00:00Z');
const monthsAgo = (m: number, dayShift = 0) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - m);
  d.setUTCDate(d.getUTCDate() + dayShift);
  return d;
};

const staff: KidsActor = { userId: 'staff1', tenantId: 't1', congregationId: 'g1', roles: ['ministry_leader'] };
const parent: KidsActor = { userId: 'parent1', tenantId: 't1', congregationId: 'g1', roles: ['member'] };
const volunteer: KidsActor = { userId: 'vol1', tenantId: 't1', congregationId: 'g1', roles: ['volunteer'] };

const room = (extra = {}) => ({
  id: 'r1',
  name: 'Maternal',
  min_age_months: 24,
  max_age_months: 47,
  allows_out_of_range: false,
  capacity: null as number | null,
  ...extra,
});
const session = (extra: { room?: object; status?: string; instance?: string } = {}) => ({
  id: 's1',
  status: extra.status ?? 'open',
  celebration_instance_id: 'i1',
  room: room(extra.room),
  celebrationInstance: { status: extra.instance ?? 'published' },
});

function build(opts: { session?: object | null; birth?: Date | null; guardians?: object[] } = {}) {
  const client = {
    kidsSession: { findFirst: jest.fn().mockResolvedValue(opts.session === undefined ? session() : opts.session) },
    person: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'c1',
        full_name: 'Ana',
        birth_date: opts.birth === undefined ? monthsAgo(36) : opts.birth,
      }),
    },
    kidsGuardian: {
      findMany: jest.fn().mockResolvedValue(
        opts.guardians ?? [
          { guardian_person_id: 'mae', is_primary: true },
          { guardian_person_id: 'avo', is_primary: false },
        ],
      ),
    },
    kidsCheckin: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
      createManyAndReturn: jest.fn().mockImplementation(({ data }: { data: object[] }) =>
        Promise.resolve(data.map((d, n) => ({ id: `k${n}`, checked_in_at: NOW, ...d }))),
      ),
    },
  };
  const access = {
    isManager: jest.fn((roles: string[]) => roles.includes('ministry_leader')),
    assertCanAccess: jest.fn().mockResolvedValue({ id: 'c1', full_name: 'Ana', birth_date: opts.birth === undefined ? monthsAgo(36) : opts.birth }),
    requireOwnPersonId: jest.fn().mockResolvedValue('mae'),
    ownPersonId: jest.fn(async (userId: string) => (userId === 'parent1' ? 'mae' : null)),
  };
  const consent = { hasValidConsent: jest.fn().mockResolvedValue(true) };
  const sessionAccess = { canOperate: jest.fn(async (a: KidsActor) => a.roles.includes('ministry_leader')) };
  const notice = { notifyChildReleased: jest.fn(), notifyChildReceived: jest.fn().mockResolvedValue(undefined) };
  const qr = {
    signCheckout: jest.fn((id: string, code: string) => `kidsco1.${id}.${code}.sig`),
    consumeCheckin: jest.fn().mockResolvedValue({ ok: true, child_id: 'c1', guardian_person_id: 'mae' }),
  };
  const svc = new KidsCheckinService(
    { client } as unknown as PrismaService,
    access as never,
    consent as never,
    sessionAccess as never,
    { notifyCheckoutDenied: jest.fn() } as never,
    notice as never,
    qr as never,
  );
  return { svc, client, access, consent, sessionAccess, qr, notice };
}

const body = (extra = {}) => ({ child_id: 'c1', guardian_person_id: 'mae', ...extra });
const errorOf = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

beforeAll(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
});
afterAll(() => jest.useRealTimers());

describe('KidsCheckinService.getOpenForChild (código ao responsável)', () => {
  const open = {
    id: 'k1',
    code: 'A2B3',
    checked_in_at: NOW,
    session_id: 's1',
    session: { room: { id: 'r1', name: 'Maternal' } },
  };
  const parentActor: KidsActor = { userId: 'p1', tenantId: 't1', congregationId: 'g1', roles: ['member'] };

  it('devolve o check-in aberto da criança com sessão, turma, horário e código', async () => {
    const { svc, client, access } = build();
    client.kidsCheckin.findFirst.mockResolvedValue(open);
    const out = await svc.getOpenForChild(parentActor, 'c1');

    expect(access.assertCanAccess).toHaveBeenCalledWith(parentActor, 'c1');
    expect(client.kidsCheckin.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { child_id: 'c1', tenant_id: 't1', congregation_id: 'g1', checked_out_at: null },
      }),
    );
    expect(out).toEqual({
      id: 'k1',
      session_id: 's1',
      room: { id: 'r1', name: 'Maternal' },
      checked_in_at: NOW,
      code: 'A2B3',
      qr: 'kidsco1.k1.A2B3.sig', // o mesmo código, assinado (R3-1)
    });
  });

  it('R3-1: o qr devolvido é assinado para ESTE check-in e este código', async () => {
    const { svc, client, qr } = build();
    client.kidsCheckin.findFirst.mockResolvedValue(open);
    await svc.getOpenForChild(parentActor, 'c1');
    expect(qr.signCheckout).toHaveBeenCalledWith('k1', 'A2B3');
  });

  it('criança sem check-in aberto: 404', async () => {
    const { svc, client } = build();
    client.kidsCheckin.findFirst.mockResolvedValue(null);
    expect(await errorOf(svc.getOpenForChild(parentActor, 'c1'))).toBeInstanceOf(NotFoundException);
  });

  it('criança que o ator não acessa: o 404 do acesso propaga, sem consultar check-in', async () => {
    const { svc, client, access } = build();
    access.assertCanAccess.mockRejectedValue(new NotFoundException());
    expect(await errorOf(svc.getOpenForChild(parentActor, 'c1'))).toBeInstanceOf(NotFoundException);
    expect(client.kidsCheckin.findFirst).not.toHaveBeenCalled();
  });
});

describe('ageInMonths', () => {
  it('conta meses completos', () => {
    expect(ageInMonths(new Date('2023-10-26T00:00:00Z'), NOW)).toBe(36);
    expect(ageInMonths(new Date('2023-10-27T00:00:00Z'), NOW)).toBe(35); // falta 1 dia
    expect(ageInMonths(new Date('2026-10-26T00:00:00Z'), NOW)).toBe(0);
  });
});

describe('KidsCheckinService.checkIn', () => {
  it('AC 1: cria o check-in com quem entrega, quem recebe, horário e código de 4 caracteres', async () => {
    const { svc, client } = build();
    const out = await svc.checkIn(staff, 's1', body());

    expect(out.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    const [{ data, skipDuplicates }] = client.kidsCheckin.createManyAndReturn.mock.calls[0];
    expect(skipDuplicates).toBe(true);
    expect(data).toEqual([
      expect.objectContaining({
        tenant_id: 't1',
        congregation_id: 'g1',
        session_id: 's1',
        celebration_instance_id: 'i1', // da sessão, para a FK composta e o índice parcial
        child_id: 'c1',
        guardian_person_id: 'mae',
        checked_in_by: 'staff1',
        age_override: false,
        code: out.code,
      }),
    ]);
    expect(out).toMatchObject({ id: 'k0', session_id: 's1', child_id: 'c1', guardian_person_id: 'mae', checked_in_by: 'staff1', age_override: false });
    expect(out.capacity_warning).toBeNull();
  });

  it('a resposta não carrega dado de saúde', async () => {
    const { svc } = build();
    const out = await svc.checkIn(staff, 's1', body());
    expect(JSON.stringify(out)).not.toMatch(/allerg|medical/i);
  });

  describe('AC 1b: responsável que entrega e quem recebe são obrigatórios', () => {
    it('400 sem guardian_person_id', async () => {
      const { svc, client } = build();
      const err = await errorOf(svc.checkIn(staff, 's1', { child_id: 'c1' } as never));
      expect(err).toBeInstanceOf(BadRequestException);
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('400 sem quem recebe (usuário autenticado sem id)', async () => {
      const { svc, client } = build();
      const err = await errorOf(svc.checkIn({ ...staff, userId: '' }, 's1', body()));
      expect(err).toBeInstanceOf(BadRequestException);
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('quem entrega tem de ser KidsGuardian DESTA criança (422)', async () => {
      const { svc } = build();
      const err = await errorOf(svc.checkIn(staff, 's1', body({ guardian_person_id: 'estranho' })));
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'kids_guardian_not_authorized' });
    });

    it('terceiro autorizado (não primário) pode entregar', async () => {
      const { svc } = build();
      await expect(svc.checkIn(staff, 's1', body({ guardian_person_id: 'avo' }))).resolves.toMatchObject({ guardian_person_id: 'avo' });
    });
  });

  describe('sessão', () => {
    it('404 quando a sessão não é da congregação', async () => {
      const { svc, client } = build({ session: null });
      await expect(svc.checkIn(staff, 's1', body())).rejects.toBeInstanceOf(NotFoundException);
      expect(client.kidsSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's1', tenant_id: 't1', congregation_id: 'g1' } }),
      );
    });

    it('AC 6 de sessões: sessão cancelada não aceita check-in (422)', async () => {
      const { svc, client } = build({ session: session({ status: 'cancelled' }) });
      const err = await errorOf(svc.checkIn(staff, 's1', body()));
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'kids_session_cancelled' });
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('instância cancelada também recusa (422)', async () => {
      const { svc } = build({ session: session({ instance: 'cancelled' }) });
      await expect(svc.checkIn(staff, 's1', body())).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('quem pode fazer o check-in', () => {
    it('voluntário não escalado nesta sessão: 403 (AC 9)', async () => {
      const { svc } = build();
      await expect(svc.checkIn(volunteer, 's1', body())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('voluntário escalado opera como equipe', async () => {
      const { svc, sessionAccess } = build();
      sessionAccess.canOperate.mockResolvedValueOnce(true);
      await expect(svc.checkIn(volunteer, 's1', body())).resolves.toMatchObject({ checked_in_by: 'vol1' });
    });

    it('papel sem relação com kids: 403', async () => {
      const { svc } = build();
      await expect(svc.checkIn({ ...staff, roles: ['visitor'] }, 's1', body())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('responsável (member) faz o check-in do PRÓPRIO filho, entregando como ele mesmo', async () => {
      const { svc, access } = build();
      const out = await svc.checkIn(parent, 's1', body());
      expect(access.assertCanAccess).toHaveBeenCalledWith(parent, 'c1');
      expect(out).toMatchObject({ guardian_person_id: 'mae', checked_in_by: 'parent1' });
    });

    it('responsável não faz check-in de criança que não é do seu Household (404 do acesso)', async () => {
      const { svc, access, client } = build();
      access.assertCanAccess.mockRejectedValueOnce(new NotFoundException('Criança não encontrada'));
      await expect(svc.checkIn(parent, 's1', body())).rejects.toBeInstanceOf(NotFoundException);
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('responsável não entrega "como" outra pessoa (403)', async () => {
      const { svc } = build();
      await expect(svc.checkIn(parent, 's1', body({ guardian_person_id: 'avo' }))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('consentimento (AC 6 do cadastro)', () => {
    it('sem consentimento vigente de nenhum responsável primário: 422', async () => {
      const { svc, consent, client } = build();
      consent.hasValidConsent.mockResolvedValue(false);
      const err = await errorOf(svc.checkIn(staff, 's1', body()));
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'kids_consent_required' });
      expect(consent.hasValidConsent).toHaveBeenCalledWith('mae');
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('consentimento do responsável primário vale quando quem entrega é o terceiro (avó não consente)', async () => {
      const { svc, consent } = build();
      consent.hasValidConsent.mockImplementation(async (id: string) => id === 'mae');
      await expect(svc.checkIn(staff, 's1', body({ guardian_person_id: 'avo' }))).resolves.toBeDefined();
    });
  });

  describe('AC 2: criança já presente na instância', () => {
    it('409 quando há check-in aberto da criança na mesma instância (qualquer turma)', async () => {
      const { svc, client } = build();
      client.kidsCheckin.findFirst.mockResolvedValueOnce({ id: 'kx' });
      await expect(svc.checkIn(staff, 's1', body())).rejects.toBeInstanceOf(ConflictException);
      expect(client.kidsCheckin.findFirst).toHaveBeenNthCalledWith(1, {
        where: { child_id: 'c1', celebration_instance_id: 'i1', checked_out_at: null },
        select: { id: true },
      });
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('corrida: o índice parcial ignora o 2º insert (skipDuplicates devolve vazio) → 409, nunca 500', async () => {
      const { svc, client } = build();
      client.kidsCheckin.findFirst
        .mockResolvedValueOnce(null) // pré-checagem: ainda livre
        .mockResolvedValueOnce(null) // código livre
        .mockResolvedValueOnce({ id: 'kx' }); // depois do insert ignorado: o outro venceu
      client.kidsCheckin.createManyAndReturn.mockResolvedValueOnce([]);
      await expect(svc.checkIn(staff, 's1', body())).rejects.toBeInstanceOf(ConflictException);
    });

    it('corrida que chega como P2002 do Prisma também vira 409', async () => {
      const { Prisma } = await import('@prisma/client');
      const { svc, client } = build();
      client.kidsCheckin.createManyAndReturn.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: 'kids_checkins_one_open_per_child_and_instance' } }),
      );
      await expect(svc.checkIn(staff, 's1', body())).rejects.toBeInstanceOf(ConflictException);
    });

    it('colisão de código na corrida (insert ignorado e criança não presente): sorteia de novo', async () => {
      const { svc, client } = build();
      client.kidsCheckin.createManyAndReturn.mockResolvedValueOnce([]);
      // findFirst: pré-checagem aberta → null; código livre → null; recheck aberto → null (foi o código)
      await expect(svc.checkIn(staff, 's1', body())).resolves.toMatchObject({ id: 'k0' });
      expect(client.kidsCheckin.createManyAndReturn).toHaveBeenCalledTimes(2);
    });

    it('colisão de código sem fim: 500 logado depois de 5 tentativas', async () => {
      const { svc, client } = build();
      client.kidsCheckin.createManyAndReturn.mockResolvedValue([]);
      await expect(svc.checkIn(staff, 's1', body())).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(client.kidsCheckin.createManyAndReturn).toHaveBeenCalledTimes(5);
    });
  });

  describe('faixa etária (AC 3, 3b e edge case de nascimento)', () => {
    it('dentro da faixa: sem override e sem pedir confirmação', async () => {
      const { svc } = build({ birth: monthsAgo(24) }); // limite inferior inclusivo
      await expect(svc.checkIn(staff, 's1', body())).resolves.toMatchObject({ age_override: false });
      const b = build({ birth: monthsAgo(47) }); // limite superior inclusivo
      await expect(b.svc.checkIn(staff, 's1', body())).resolves.toMatchObject({ age_override: false });
    });

    it('sem birth_date: 422 pedindo a data', async () => {
      const { svc, client } = build({ birth: null });
      const err = await errorOf(svc.checkIn(staff, 's1', body()));
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'kids_birth_date_required' });
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('3b: fora da faixa e allows_out_of_range=false: 422 "fora da faixa etária da turma", mesmo com confirmação', async () => {
      const { svc, client } = build({ birth: monthsAgo(12) });
      for (const confirm of [undefined, true]) {
        const err = await errorOf(svc.checkIn(staff, 's1', body({ confirm_out_of_range: confirm })));
        expect(err).toBeInstanceOf(UnprocessableEntityException);
        const res = (err as UnprocessableEntityException).getResponse() as { message: string; code: string };
        expect(res.message).toBe('Criança fora da faixa etária da turma');
        expect(res.code).toBe('kids_out_of_range');
      }
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('3: fora da faixa e a turma aceita: pede confirmação com idade e faixa (OUT_OF_RANGE_CONFIRM)', async () => {
      const { svc, client } = build({ birth: monthsAgo(60), session: session({ room: { allows_out_of_range: true } }) });
      const err = await errorOf(svc.checkIn(staff, 's1', body()));
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect((err as UnprocessableEntityException).getResponse()).toMatchObject({
        statusCode: 422,
        code: 'OUT_OF_RANGE_CONFIRM',
        requires_confirmation: true,
        age_months: 60,
        min_age_months: 24,
        max_age_months: 47,
        room_name: 'Maternal',
      });
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('3: confirmado, grava age_override = true (abaixo e acima da faixa)', async () => {
      for (const months of [10, 60]) {
        const { svc, client } = build({ birth: monthsAgo(months), session: session({ room: { allows_out_of_range: true } }) });
        const out = await svc.checkIn(staff, 's1', body({ confirm_out_of_range: true }));
        expect(out.age_override).toBe(true);
        expect(client.kidsCheckin.createManyAndReturn.mock.calls[0][0].data[0].age_override).toBe(true);
      }
    });

    it('confirm_out_of_range sobrando numa criança dentro da faixa não marca override', async () => {
      const { svc } = build({ session: session({ room: { allows_out_of_range: true } }) });
      await expect(svc.checkIn(staff, 's1', body({ confirm_out_of_range: true }))).resolves.toMatchObject({ age_override: false });
    });
  });

  describe('AC 4: capacidade só avisa', () => {
    it('ao atingir a capacidade, avisa e grava o check-in', async () => {
      const { svc, client } = build({ session: session({ room: { capacity: 12 } }) });
      client.kidsCheckin.count.mockResolvedValue(12);
      const out = await svc.checkIn(staff, 's1', body());
      expect(out.capacity_warning).toEqual({ capacity: 12, present: 12 });
      expect(client.kidsCheckin.createManyAndReturn).toHaveBeenCalledTimes(1);
      expect(client.kidsCheckin.count).toHaveBeenCalledWith({ where: { session_id: 's1', checked_out_at: null } });
    });

    it('acima da capacidade continua sem bloquear', async () => {
      const { svc, client } = build({ session: session({ room: { capacity: 12 } }) });
      client.kidsCheckin.count.mockResolvedValue(15);
      await expect(svc.checkIn(staff, 's1', body())).resolves.toMatchObject({ capacity_warning: { capacity: 12, present: 15 } });
    });

    it('abaixo da capacidade ou sem capacidade: sem aviso', async () => {
      const a = build({ session: session({ room: { capacity: 12 } }) });
      a.client.kidsCheckin.count.mockResolvedValue(11);
      expect((await a.svc.checkIn(staff, 's1', body())).capacity_warning).toBeNull();
      const b = build();
      b.client.kidsCheckin.count.mockResolvedValue(99);
      expect((await b.svc.checkIn(staff, 's1', body())).capacity_warning).toBeNull();
    });
  });

  it('404 quando a criança não existe na congregação (equipe)', async () => {
    const { svc, client } = build();
    client.person.findFirst.mockResolvedValue(null);
    await expect(svc.checkIn(staff, 's1', body())).rejects.toBeInstanceOf(NotFoundException);
    expect(client.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'c1', tenant_id: 't1', congregation_id: 'g1', is_child: true, deleted_at: null }) }),
    );
  });
});

describe('KidsCheckinService.checkInByQr (R3-1)', () => {
  const dto = { qr: 'kidsci1.x.y' };

  it('a equipe lê o QR: check-in normal com a criança e o responsável de quem emitiu, e checked_in_by = quem leu', async () => {
    const { svc, client, qr } = build();
    const out = await svc.checkInByQr(staff, 's1', dto);

    expect(qr.consumeCheckin).toHaveBeenCalledWith(staff, 'kidsci1.x.y');
    const [{ data }] = client.kidsCheckin.createManyAndReturn.mock.calls[0];
    expect(data[0]).toMatchObject({ child_id: 'c1', guardian_person_id: 'mae', checked_in_by: 'staff1', session_id: 's1' });
    expect(out).toMatchObject({ child_id: 'c1', guardian_person_id: 'mae', checked_in_by: 'staff1' });
    expect(out.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  });

  it('passa por TODAS as regras do check-in: fora da faixa (422), 409, consentimento e capacidade só avisa', async () => {
    const outOfRange = build({ session: session({ room: { min_age_months: 100, max_age_months: 119 } }) });
    expect(await errorOf(outOfRange.svc.checkInByQr(staff, 's1', dto))).toBeInstanceOf(UnprocessableEntityException);

    const dup = build();
    dup.client.kidsCheckin.findFirst.mockResolvedValue({ id: 'ja' });
    expect(await errorOf(dup.svc.checkInByQr(staff, 's1', dto))).toBeInstanceOf(ConflictException);

    const noConsent = build();
    noConsent.consent.hasValidConsent.mockResolvedValue(false);
    expect(await errorOf(noConsent.svc.checkInByQr(staff, 's1', dto))).toBeInstanceOf(UnprocessableEntityException);

    const cap = build({ session: session({ room: { capacity: 1 } }) });
    expect((await cap.svc.checkInByQr(staff, 's1', dto)).capacity_warning).toEqual({ capacity: 1, present: 1 });
  });

  it('confirm_out_of_range segue para a regra da faixa', async () => {
    const { svc, client } = build({ session: session({ room: { min_age_months: 0, max_age_months: 11, allows_out_of_range: true } }) });
    await svc.checkInByQr(staff, 's1', { ...dto, confirm_out_of_range: true });
    expect(client.kidsCheckin.createManyAndReturn.mock.calls[0][0].data[0].age_override).toBe(true);
  });

  it.each(['malformed', 'unknown', 'forged', 'expired', 'used'] as const)(
    'QR %s: 403 com a MESMA mensagem, motivo só na auditoria, nada gravado',
    async (reason) => {
      const { svc, client, qr } = build();
      qr.consumeCheckin.mockResolvedValue({ ok: false, reason });
      const err = await errorOf(svc.checkInByQr(staff, 's1', dto));

      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        message: 'Não foi possível validar o QR. Peça um novo ao responsável.',
      });
      expect(JSON.stringify((err as ForbiddenException).getResponse())).not.toContain(reason);
      expect(client.kidsCheckin.createManyAndReturn).not.toHaveBeenCalled();
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'kids.checkin_qr_denied', after: { session_id: 's1', reason } }),
        expect.anything(),
      );
    },
  );

  it('quem não opera a sessão (responsável, voluntário não escalado) leva 403 ANTES de o QR ser consumido', async () => {
    for (const actor of [parent, volunteer]) {
      const { svc, qr } = build();
      expect(await errorOf(svc.checkInByQr(actor, 's1', dto))).toBeInstanceOf(ForbiddenException);
      expect(qr.consumeCheckin).not.toHaveBeenCalled();
    }
  });
});

describe('KidsCheckinService.checkIn: push "Criança recebida" (R3-3a)', () => {
  it('check-in pela equipe: avisa o primário com a turma, a criança e a pessoa de quem fez o check-in (conta da equipe sem pessoa = null)', async () => {
    const { svc, notice } = build();
    const out = await svc.checkIn(staff, 's1', body());
    expect(notice.notifyChildReceived).toHaveBeenCalledTimes(1);
    expect(notice.notifyChildReceived).toHaveBeenCalledWith('t1', 'g1', {
      checkinId: out.id,
      sessionId: 's1',
      childId: 'c1',
      roomName: 'Maternal',
      actorPersonId: null,
    });
  });

  it('check-in feito pelo próprio responsável no app: informa a pessoa dele, para o serviço de aviso não o notificar', async () => {
    const { svc, notice } = build();
    await svc.checkIn(parent, 's1', body());
    expect(notice.notifyChildReceived).toHaveBeenCalledWith('t1', 'g1', expect.objectContaining({ actorPersonId: 'mae' }));
  });

  it('check-in que falha (409, 422, 403) não avisa ninguém', async () => {
    const dup = build();
    dup.client.kidsCheckin.findFirst.mockResolvedValue({ id: 'ja' });
    await errorOf(dup.svc.checkIn(staff, 's1', body()));
    const range = build({ session: session({ room: { min_age_months: 100, max_age_months: 119 } }) });
    await errorOf(range.svc.checkIn(staff, 's1', body()));
    expect(dup.notice.notifyChildReceived).not.toHaveBeenCalled();
    expect(range.notice.notifyChildReceived).not.toHaveBeenCalled();
  });

  it('falha do aviso (ou da busca da pessoa) nunca desfaz o check-in: segue 201 com o código', async () => {
    const a = build();
    a.notice.notifyChildReceived.mockRejectedValue(new Error('OneSignal fora do ar'));
    expect((await a.svc.checkIn(staff, 's1', body())).code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    const b = build();
    b.access.ownPersonId.mockRejectedValue(new Error('db'));
    expect((await b.svc.checkIn(staff, 's1', body())).code).toBeDefined();
  });

  it('check-in por QR também avisa (é o check-in normal)', async () => {
    const { svc, notice } = build();
    await svc.checkInByQr(staff, 's1', { qr: 'kidsci1.x.y' });
    expect(notice.notifyChildReceived).toHaveBeenCalledTimes(1);
  });
});
