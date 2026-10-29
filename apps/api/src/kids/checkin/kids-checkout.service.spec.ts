import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { KidsCheckinService } from './kids-checkin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor } from '../children/kids-child-access.service';
import * as audit from '../../common/audit/write-audit-log';

jest.mock('../../common/audit/write-audit-log', () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));
const writeAuditLog = audit.writeAuditLog as jest.Mock;

const NOW = new Date('2026-10-26T15:00:00Z');
const leader: KidsActor = { userId: 'lider1', tenantId: 't1', congregationId: 'g1', roles: ['ministry_leader'] };
const volunteer: KidsActor = { userId: 'vol1', tenantId: 't1', congregationId: 'g1', roles: ['volunteer'] };
const parent: KidsActor = { userId: 'parent1', tenantId: 't1', congregationId: 'g1', roles: ['member'] };

const openCheckin = (extra = {}) => ({
  id: 'k1',
  session_id: 's1',
  child_id: 'c1',
  code: 'A2B3',
  checked_out_at: null,
  session: { room: { name: 'Maternal' } },
  checkout_failed_attempts: 0,
  ...extra,
});
const guardians = [
  { guardian_person_id: 'mae', guardian: { full_name: 'Maria Souza' } },
  { guardian_person_id: 'avo', guardian: { full_name: 'Joana  Lima' } },
];

function build(checkin: object | null = openCheckin()) {
  const client = {
    kidsCheckin: {
      findFirst: jest.fn().mockResolvedValue(checkin),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    kidsGuardian: { findMany: jest.fn().mockResolvedValue(guardians) },
  };
  // R3-2: o contador sobe por função SQL no client BASE (fora da transação da
  // requisição, que o 403 desfaz). Devolve o novo total; por padrão, a 1ª falha.
  const queryRaw = jest.fn().mockResolvedValue([{ attempts: 1 }]);
  const sessionAccess = { canOperate: jest.fn(async (a: KidsActor) => a.roles.includes('ministry_leader')) };
  const alert = {
    notifyCheckoutDenied: jest.fn().mockResolvedValue(undefined),
    notifyCheckoutLocked: jest.fn().mockResolvedValue(undefined),
  };
  const access = { isManager: jest.fn((roles: string[]) => roles.includes('ministry_leader')) };
  const notice = { notifyChildReleased: jest.fn().mockResolvedValue(undefined) };
  const svc = new KidsCheckinService(
    { client, $queryRaw: queryRaw } as unknown as PrismaService,
    access as never,
    {} as never,
    sessionAccess as never,
    alert as never,
    notice as never,
  );
  return { svc, client, sessionAccess, alert, notice, queryRaw };
}

const errorOf = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

beforeAll(() => jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] }));
afterAll(() => jest.useRealTimers());
beforeEach(() => writeAuditLog.mockClear());

describe('KidsCheckinService.checkOut', () => {
  describe('AC 6: código certo e responsável com can_pickup fecha o check-in', () => {
    it('fecha com horário, quem retirou (por id) e quem conferiu', async () => {
      const { svc, client } = build();
      const out = await svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_person_id: 'mae' });

      expect(client.kidsGuardian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { child_id: 'c1', can_pickup: true } }),
      );
      expect(client.kidsCheckin.updateMany).toHaveBeenCalledWith({
        where: { id: 'k1', checked_out_at: null },
        data: {
          checked_out_at: NOW,
          checked_out_by: 'lider1',
          picked_up_by_person_id: 'mae',
          picked_up_by_name: 'Maria Souza',
        },
      });
      expect(out).toMatchObject({ id: 'k1', checked_out_at: NOW, picked_up_by_person_id: 'mae', picked_up_by_name: 'Maria Souza' });
      expect(writeAuditLog).not.toHaveBeenCalled();
    });

    it('terceiro cadastrado retira informando o nome (sem acento/caixa/espaço duplo importando)', async () => {
      const { svc, client } = build();
      await svc.checkOut(leader, 'k1', { code: 'a2b3', picked_up_by_name: '  joana lima ' });
      expect(client.kidsCheckin.updateMany.mock.calls[0][0].data).toMatchObject({
        picked_up_by_person_id: 'avo',
        picked_up_by_name: 'Joana  Lima',
      });
    });

    it('voluntário escalado fecha o check-in da sua sessão', async () => {
      const { svc, sessionAccess } = build();
      sessionAccess.canOperate.mockResolvedValueOnce(true);
      await expect(svc.checkOut(volunteer, 'k1', { code: 'A2B3', picked_up_by_person_id: 'mae' })).resolves.toBeDefined();
      expect(sessionAccess.canOperate).toHaveBeenCalledWith(volunteer, 's1');
    });
  });

  describe('AC 7: recusa genérica, auditada, com aviso ao líder', () => {
    const GENERIC = 'Não foi possível confirmar a retirada. Chame o líder kids.';

    it('código errado e pessoa sem can_pickup dão o MESMO 403, sem revelar o motivo', async () => {
      const a = build();
      const wrongCode = await errorOf(a.svc.checkOut(leader, 'k1', { code: 'ZZZZ', picked_up_by_person_id: 'mae' }));
      const b = build();
      b.client.kidsGuardian.findMany.mockResolvedValue([]); // a pessoa não tem can_pickup
      const noPickup = await errorOf(b.svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_person_id: 'avo' }));

      for (const err of [wrongCode, noPickup]) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({ statusCode: 403, message: GENERIC });
      }
      expect((wrongCode as ForbiddenException).getResponse()).toEqual((noPickup as ForbiddenException).getResponse());
      expect(a.client.kidsCheckin.updateMany).not.toHaveBeenCalled();
      expect(b.client.kidsCheckin.updateMany).not.toHaveBeenCalled();
    });

    it('nome que não é de terceiro autorizado também é recusado', async () => {
      const { svc } = build();
      await expect(svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_name: 'Fulano Qualquer' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('grava auditoria sem dado de saúde e sem o código digitado, e avisa o líder', async () => {
      const { svc, alert } = build();
      await errorOf(svc.checkOut(leader, 'k1', { code: 'ZZZZ', picked_up_by_person_id: 'mae' }));

      expect(writeAuditLog).toHaveBeenCalledTimes(1);
      const [, entry] = writeAuditLog.mock.calls[0];
      expect(entry).toMatchObject({
        tenant_id: 't1',
        congregation_id: 'g1',
        actor_user_id: 'lider1',
        subject_person_id: 'c1',
        entity: 'kids_checkin',
        action: 'kids.checkout_denied',
      });
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toMatch(/allerg|medical|ZZZZ|A2B3/i);
      expect(alert.notifyCheckoutDenied).toHaveBeenCalledWith('t1', 'g1', { sessionId: 's1', checkinId: 'k1', roomName: 'Maternal' });
    });

    it('a recusa sai 403 mesmo se a auditoria ou o aviso falharem (ambos são best-effort)', async () => {
      const { svc, alert } = build();
      writeAuditLog.mockRejectedValueOnce(new Error('audit'));
      alert.notifyCheckoutDenied.mockRejectedValueOnce(new Error('push'));
      expect(await errorOf(svc.checkOut(leader, 'k1', { code: 'ZZZZ', picked_up_by_person_id: 'mae' }))).toBeInstanceOf(ForbiddenException);
    });
  });

  describe('bordas', () => {
    it('400 sem dizer quem retira (nem id nem nome)', async () => {
      const { svc, client } = build();
      await expect(svc.checkOut(leader, 'k1', { code: 'A2B3' })).rejects.toBeInstanceOf(BadRequestException);
      expect(client.kidsCheckin.updateMany).not.toHaveBeenCalled();
    });

    it('404 quando o check-in não é da congregação', async () => {
      const { svc, client } = build(null);
      await expect(svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_person_id: 'mae' })).rejects.toBeInstanceOf(NotFoundException);
      expect(client.kidsCheckin.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'k1', tenant_id: 't1', congregation_id: 'g1' } }),
      );
    });

    it('403 para quem não opera a sessão (voluntário não escalado, responsável), sem auditar como recusa de retirada', async () => {
      for (const actor of [volunteer, parent]) {
        const { svc, alert } = build();
        await expect(svc.checkOut(actor, 'k1', { code: 'A2B3', picked_up_by_person_id: 'mae' })).rejects.toBeInstanceOf(ForbiddenException);
        expect(alert.notifyCheckoutDenied).not.toHaveBeenCalled();
      }
      expect(writeAuditLog).not.toHaveBeenCalled();
    });

    it('check-in já fechado não reabre nem fecha de novo: 409', async () => {
      const { svc, client } = build(openCheckin({ checked_out_at: NOW }));
      await expect(svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_person_id: 'mae' })).rejects.toBeInstanceOf(ConflictException);
      expect(client.kidsCheckin.updateMany).not.toHaveBeenCalled();
    });

    it('dois check-outs simultâneos: o segundo update não acha linha aberta → 409', async () => {
      const { svc, client } = build();
      client.kidsCheckin.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_person_id: 'mae' })).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

describe('KidsCheckinService.checkOutOverride', () => {
  const dto = { reason: 'Perdeu a etiqueta; conferi o RG', picked_up_by_name: 'Maria Souza' };

  it('AC 8: líder kids fecha por exceção gravando motivo, quem retirou e quem autorizou', async () => {
    const { svc, client } = build();
    const out = await svc.checkOutOverride(leader, 'k1', dto);

    expect(client.kidsCheckin.updateMany).toHaveBeenCalledWith({
      where: { id: 'k1', checked_out_at: null },
      data: {
        checked_out_at: NOW,
        checked_out_by: 'lider1',
        picked_up_by_name: 'Maria Souza',
        override_reason: 'Perdeu a etiqueta; conferi o RG',
      },
    });
    expect(out).toMatchObject({ id: 'k1', override_reason: dto.reason, picked_up_by_name: 'Maria Souza' });
  });

  it('registra evento de auditoria da exceção, sem dado de saúde', async () => {
    const { svc } = build();
    await svc.checkOutOverride(leader, 'k1', dto);
    const [, entry] = writeAuditLog.mock.calls[0];
    expect(entry).toMatchObject({
      tenant_id: 't1',
      actor_user_id: 'lider1',
      subject_person_id: 'c1',
      entity: 'kids_checkin',
      action: 'kids.checkout_override',
      after: { checkin_id: 'k1', session_id: 's1', picked_up_by_name: 'Maria Souza', reason: dto.reason },
    });
    expect(JSON.stringify(entry)).not.toMatch(/allerg|medical/i);
  });

  it('400 sem motivo ou sem nome (defesa além do DTO)', async () => {
    const { svc, client } = build();
    await expect(svc.checkOutOverride(leader, 'k1', { reason: '  ', picked_up_by_name: 'Maria' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.checkOutOverride(leader, 'k1', { reason: 'Motivo bom', picked_up_by_name: '' })).rejects.toBeInstanceOf(BadRequestException);
    expect(client.kidsCheckin.updateMany).not.toHaveBeenCalled();
  });

  it('só a gestão: voluntário escalado e responsável levam 403', async () => {
    for (const actor of [volunteer, parent]) {
      const { svc, sessionAccess, client } = build();
      sessionAccess.canOperate.mockResolvedValue(true);
      await expect(svc.checkOutOverride(actor, 'k1', dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.kidsCheckin.updateMany).not.toHaveBeenCalled();
    }
  });

  it('404 e 409 (já fechado / corrida), sem reabrir', async () => {
    await expect(build(null).svc.checkOutOverride(leader, 'k1', dto)).rejects.toBeInstanceOf(NotFoundException);
    await expect(build(openCheckin({ checked_out_at: NOW })).svc.checkOutOverride(leader, 'k1', dto)).rejects.toBeInstanceOf(ConflictException);
    const race = build();
    race.client.kidsCheckin.updateMany.mockResolvedValue({ count: 0 });
    await expect(race.svc.checkOutOverride(leader, 'k1', dto)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('aviso "Criança entregue" ao responsável primário (best-effort)', () => {
  const released = (picked: string | null) => ({
    checkinId: 'k1',
    sessionId: 's1',
    childId: 'c1',
    roomName: 'Maternal',
    pickedUpByPersonId: picked,
  });

  it('check-out com código avisa, informando quem retirou para não avisá-lo', async () => {
    const { svc, notice } = build();
    await svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_person_id: 'avo' });
    expect(notice.notifyChildReleased).toHaveBeenCalledWith('t1', 'g1', released('avo'));
  });

  it('o override também avisa (retirada por exceção, sem pessoa cadastrada)', async () => {
    const { svc, notice } = build();
    await svc.checkOutOverride(leader, 'k1', { reason: 'Perdeu a etiqueta', picked_up_by_name: 'Maria' });
    expect(notice.notifyChildReleased).toHaveBeenCalledWith('t1', 'g1', released(null));
  });

  it('retirada recusada, check-in já fechado ou corrida perdida: ninguém é avisado', async () => {
    const denied = build();
    await errorOf(denied.svc.checkOut(leader, 'k1', { code: 'ZZZZ', picked_up_by_person_id: 'avo' }));
    expect(denied.notice.notifyChildReleased).not.toHaveBeenCalled();

    const closed = build(openCheckin({ checked_out_at: NOW }));
    await errorOf(closed.svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_person_id: 'avo' }));
    expect(closed.notice.notifyChildReleased).not.toHaveBeenCalled();

    const lost = build();
    lost.client.kidsCheckin.updateMany.mockResolvedValue({ count: 0 });
    await errorOf(lost.svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_person_id: 'avo' }));
    expect(lost.notice.notifyChildReleased).not.toHaveBeenCalled();
  });

  it('falha no aviso nunca desfaz o check-out', async () => {
    const { svc, notice } = build();
    notice.notifyChildReleased.mockRejectedValue(new Error('OneSignal fora do ar'));
    const out = await svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_person_id: 'mae' });
    expect(out).toMatchObject({ id: 'k1', picked_up_by_person_id: 'mae' });
  });
});

describe('KidsCheckinService.checkOut: limite de 5 tentativas (R3-2)', () => {
  const GENERIC = 'Não foi possível confirmar a retirada. Chame o líder kids.';
  const wrong = { code: 'ZZZZ', picked_up_by_person_id: 'mae' };
  const right = { code: 'A2B3', picked_up_by_person_id: 'mae' };
  const actions = () => writeAuditLog.mock.calls.map(([, e]) => e.action);

  it('cada código errado registra UMA falha, no escopo do check-in, pela função fora da transação', async () => {
    const { svc, queryRaw } = build();
    await errorOf(svc.checkOut(leader, 'k1', wrong));
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(['k1', 't1', 'g1']);
  });

  it('da 1ª à 4ª falha só recusa e avisa como antes (sem travar)', async () => {
    for (const n of [1, 2, 3, 4]) {
      writeAuditLog.mockClear();
      const { svc, queryRaw, alert } = build(openCheckin({ checkout_failed_attempts: n - 1 }));
      queryRaw.mockResolvedValue([{ attempts: n }]);
      expect(await errorOf(svc.checkOut(leader, 'k1', wrong))).toBeInstanceOf(ForbiddenException);
      expect(actions()).toEqual(['kids.checkout_denied']);
      expect(alert.notifyCheckoutDenied).toHaveBeenCalledTimes(1);
      expect(alert.notifyCheckoutLocked).not.toHaveBeenCalled();
    }
  });

  it('4 falhas e depois o código certo: fecha normalmente', async () => {
    const { svc, client, queryRaw } = build(openCheckin({ checkout_failed_attempts: 4 }));
    const out = await svc.checkOut(leader, 'k1', right);
    expect(out).toMatchObject({ id: 'k1', picked_up_by_person_id: 'mae' });
    expect(client.kidsCheckin.updateMany).toHaveBeenCalledTimes(1);
    expect(queryRaw).not.toHaveBeenCalled(); // acerto não conta como falha
  });

  it('na 5ª falha: 403 idêntico ao da recusa comum, auditoria kids.checkout_locked e aviso ao líder', async () => {
    const common = build();
    const commonErr = await errorOf(common.svc.checkOut(leader, 'k1', wrong));

    writeAuditLog.mockClear();
    const { svc, queryRaw, alert } = build(openCheckin({ checkout_failed_attempts: 4 }));
    queryRaw.mockResolvedValue([{ attempts: 5 }]);
    const err = await errorOf(svc.checkOut(leader, 'k1', wrong));

    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toEqual((commonErr as ForbiddenException).getResponse());
    expect((err as ForbiddenException).getResponse()).toMatchObject({ statusCode: 403, message: GENERIC });
    expect(actions()).toEqual(['kids.checkout_denied', 'kids.checkout_locked']);
    const locked = writeAuditLog.mock.calls[1][1];
    expect(locked).toMatchObject({ tenant_id: 't1', congregation_id: 'g1', actor_user_id: 'lider1', subject_person_id: 'c1', entity: 'kids_checkin' });
    expect(JSON.stringify(locked)).not.toMatch(/ZZZZ|A2B3|allerg|medical/i);
    expect(alert.notifyCheckoutLocked).toHaveBeenCalledWith('t1', 'g1', { sessionId: 's1', checkinId: 'k1', roomName: 'Maternal' });
    expect(alert.notifyCheckoutDenied).not.toHaveBeenCalled(); // um aviso só: o do travamento
  });

  it('5 falhas + código CERTO + pessoa autorizada: o MESMO 403, sem fechar e sem revelar o travamento', async () => {
    const common = build();
    const commonErr = await errorOf(common.svc.checkOut(leader, 'k1', wrong));

    writeAuditLog.mockClear();
    const { svc, client, queryRaw, alert } = build(openCheckin({ checkout_failed_attempts: 5 }));
    const err = await errorOf(svc.checkOut(leader, 'k1', right));

    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toEqual((commonErr as ForbiddenException).getResponse());
    expect(client.kidsCheckin.updateMany).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled(); // travado não acumula contagem
    expect(actions()).toEqual(['kids.checkout_denied']); // rastro de cada tentativa, mas
    expect(writeAuditLog.mock.calls[0][1].after).toMatchObject({ reason: 'locked' });
    expect(alert.notifyCheckoutLocked).not.toHaveBeenCalled(); // nenhum aviso repetido
    expect(alert.notifyCheckoutDenied).not.toHaveBeenCalled();
  });

  it('travado também recusa por nome de terceiro e por contagem acima de 5', async () => {
    const { svc, client } = build(openCheckin({ checkout_failed_attempts: 9 }));
    expect(await errorOf(svc.checkOut(leader, 'k1', { code: 'A2B3', picked_up_by_name: 'Joana Lima' }))).toBeInstanceOf(ForbiddenException);
    expect(client.kidsCheckin.updateMany).not.toHaveBeenCalled();
  });

  it('código certo com pessoa sem can_pickup é recusa, mas NÃO conta como tentativa de código', async () => {
    const { svc, client, queryRaw } = build();
    client.kidsGuardian.findMany.mockResolvedValue([]);
    await errorOf(svc.checkOut(leader, 'k1', right));
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('o override do líder continua fechando um check-in travado', async () => {
    const { svc, client } = build(openCheckin({ checkout_failed_attempts: 5 }));
    const out = await svc.checkOutOverride(leader, 'k1', { reason: 'Conferi o RG da mãe', picked_up_by_name: 'Maria Souza' });
    expect(out).toMatchObject({ id: 'k1', override_reason: 'Conferi o RG da mãe' });
    expect(client.kidsCheckin.updateMany).toHaveBeenCalledTimes(1);
  });

  it('falha ao gravar o contador não muda a resposta (best-effort): segue 403', async () => {
    const { svc, queryRaw } = build();
    queryRaw.mockRejectedValue(new Error('db'));
    expect(await errorOf(svc.checkOut(leader, 'k1', wrong))).toBeInstanceOf(ForbiddenException);
  });

  it('quem não opera a sessão leva 403 sem gastar tentativa do check-in', async () => {
    const { svc, queryRaw } = build();
    await errorOf(svc.checkOut(volunteer, 'k1', wrong));
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
