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
  const sessionAccess = { canOperate: jest.fn(async (a: KidsActor) => a.roles.includes('ministry_leader')) };
  const alert = { notifyCheckoutDenied: jest.fn().mockResolvedValue(undefined) };
  const access = { isManager: jest.fn((roles: string[]) => roles.includes('ministry_leader')) };
  const svc = new KidsCheckinService({ client } as unknown as PrismaService, access as never, {} as never, sessionAccess as never, alert as never);
  return { svc, client, sessionAccess, alert };
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
