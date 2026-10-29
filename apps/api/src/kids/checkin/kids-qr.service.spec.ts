import { createHash } from 'crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { KIDS_QR_TTL_SECONDS, KidsQrService } from './kids-qr.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsActor } from '../children/kids-child-access.service';

const NOW = new Date('2026-10-29T15:00:00Z');
const UUID = '11111111-1111-4111-8111-111111111111';
const parent: KidsActor = { userId: 'acc-mae', tenantId: 't1', congregationId: 'g1', roles: ['member'] };
const staff: KidsActor = { userId: 'acc-staff', tenantId: 't1', congregationId: 'g1', roles: ['ministry_leader'] };

beforeAll(() => {
  process.env['JWT_SECRET'] = 'segredo-de-teste-do-kids-qr';
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
});
afterAll(() => jest.useRealTimers());

function build(overrides: { child?: object | null; link?: object | null; guardian?: object | null; open?: object | null } = {}) {
  const has = <K extends string>(k: K, d: object | null) => (k in overrides ? (overrides as Record<string, object | null>)[k] : d);
  const client = {
    person: { findFirst: jest.fn().mockResolvedValue(has('child', { id: 'c1' })) },
    householdMember: { findFirst: jest.fn().mockResolvedValue(has('link', { id: 'hm1' })) },
    kidsGuardian: { findFirst: jest.fn().mockResolvedValue(has('guardian', { id: 'kg1' })) },
    kidsCheckin: { findFirst: jest.fn().mockResolvedValue(has('open', null)) },
    kidsCheckinQrToken: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: UUID, ...data })),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const access = { requireOwnPersonId: jest.fn().mockResolvedValue('p-mae') };
  const svc = new KidsQrService({ client } as unknown as PrismaService, access as never);
  return { svc, client, access };
}

describe('QR do check-out (código embutido de forma verificável)', () => {
  const { svc } = build();

  it('ida e volta: o QR devolve o código do check-in para o qual foi assinado', () => {
    const qr = svc.signCheckout('k1', 'A2B3');
    expect(svc.codeFromCheckoutQr(qr, 'k1')).toBe('A2B3');
  });

  it('QR de OUTRO check-in não vale para este', () => {
    expect(svc.codeFromCheckoutQr(svc.signCheckout('k2', 'A2B3'), 'k1')).toBeNull();
  });

  it.each([
    ['código adulterado', (q: string) => q.replace('A2B3', 'ZZZZ')],
    ['id adulterado', (q: string) => q.replace('.k1.', '.k9.')],
    ['assinatura adulterada', (q: string) => `${q.slice(0, -2)}xx`],
    ['assinatura removida', (q: string) => q.split('.').slice(0, 3).join('.')],
    ['prefixo de check-in (kidsci1)', (q: string) => q.replace('kidsco1', 'kidsci1')],
    ['lixo', () => 'qualquer-coisa'],
    ['vazio', () => ''],
  ])('forjado (%s) não vale', (_l, mutate) => {
    expect(svc.codeFromCheckoutQr(mutate(svc.signCheckout('k1', 'A2B3')), 'k1')).toBeNull();
  });

  it('assinado com outro segredo não vale', () => {
    const qr = svc.signCheckout('k1', 'A2B3');
    process.env['JWT_SECRET'] = 'outro-segredo';
    expect(svc.codeFromCheckoutQr(qr, 'k1')).toBeNull();
    process.env['JWT_SECRET'] = 'segredo-de-teste-do-kids-qr';
  });
});

describe('KidsQrService.issueCheckin (QR de check-in do responsável)', () => {
  it('emite QR de curta duração para o par criança + responsável e guarda só o HASH do segredo', async () => {
    const { svc, client } = build();
    const out = await svc.issueCheckin(parent, 'c1');

    expect(KIDS_QR_TTL_SECONDS).toBeLessThanOrEqual(600); // "poucos minutos"
    expect(out).toMatchObject({ child_id: 'c1', guardian_person_id: 'p-mae', ttl_seconds: KIDS_QR_TTL_SECONDS });
    expect(out.expires_at).toEqual(new Date(NOW.getTime() + KIDS_QR_TTL_SECONDS * 1000));
    const [prefix, id, secret] = out.qr.split('.');
    expect(prefix).toBe('kidsci1');
    expect(id).toBe(UUID);
    expect(secret!.length).toBeGreaterThanOrEqual(40);

    const data = client.kidsCheckinQrToken.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenant_id: 't1',
      congregation_id: 'g1',
      child_id: 'c1',
      guardian_person_id: 'p-mae',
      issued_by: 'acc-mae',
      secret_hash: createHash('sha256').update(secret!).digest('hex'),
    });
    expect(JSON.stringify(data)).not.toContain(secret!);
  });

  it('cada emissão é um segredo novo e invalida os QRs anteriores ainda não usados do par', async () => {
    const { svc, client } = build();
    const a = await svc.issueCheckin(parent, 'c1');
    const b = await svc.issueCheckin(parent, 'c1');
    expect(a.qr.split('.')[2]).not.toBe(b.qr.split('.')[2]);
    expect(client.kidsCheckinQrToken.deleteMany).toHaveBeenCalledWith({
      where: { child_id: 'c1', guardian_person_id: 'p-mae', used_at: null },
    });
  });

  it('só o responsável do próprio Household: criança alheia, sem vínculo de Household ou sem KidsGuardian = 404', async () => {
    for (const o of [{ child: null }, { link: null }, { guardian: null }]) {
      const { svc, client } = build(o);
      expect(await svc.issueCheckin(staff, 'c1').catch((e) => e)).toBeInstanceOf(NotFoundException);
      expect(client.kidsCheckinQrToken.create).not.toHaveBeenCalled();
    }
  });

  it('a gestão NÃO ganha atalho: o vínculo de Household é exigido de todo papel', async () => {
    const { svc, client } = build({ link: null });
    await expect(svc.issueCheckin(staff, 'c1')).rejects.toBeInstanceOf(NotFoundException);
    expect(client.householdMember.findFirst).toHaveBeenCalledWith({
      where: { person_id: 'c1', role: 'child', household: { members: { some: { person_id: 'p-mae', role: { not: 'child' } } } } },
      select: { id: true },
    });
  });

  it('criança que já está presente: 409 (não emite QR inútil)', async () => {
    const { svc, client } = build({ open: { id: 'k1' } });
    await expect(svc.issueCheckin(parent, 'c1')).rejects.toBeInstanceOf(ConflictException);
    expect(client.kidsCheckinQrToken.create).not.toHaveBeenCalled();
  });
});

describe('KidsQrService.consumeCheckin (a equipe lê o QR)', () => {
  const SECRET = 'A'.repeat(43);
  const qr = `kidsci1.${UUID}.${SECRET}`;
  const row = (extra = {}) => ({
    id: UUID,
    child_id: 'c1',
    guardian_person_id: 'p-mae',
    secret_hash: createHash('sha256').update(SECRET).digest('hex'),
    expires_at: new Date(NOW.getTime() + 60_000),
    used_at: null,
    ...extra,
  });

  it('QR válido devolve criança e responsável de quem emitiu e o consome atomicamente (uso único)', async () => {
    const { svc, client } = build();
    client.kidsCheckinQrToken.findFirst.mockResolvedValue(row());
    const out = await svc.consumeCheckin(staff, qr);

    expect(out).toEqual({ ok: true, child_id: 'c1', guardian_person_id: 'p-mae' });
    expect(client.kidsCheckinQrToken.findFirst).toHaveBeenCalledWith({
      where: { id: UUID, tenant_id: 't1', congregation_id: 'g1' },
    });
    expect(client.kidsCheckinQrToken.updateMany).toHaveBeenCalledWith({
      where: { id: UUID, used_at: null, expires_at: { gt: NOW } },
      data: { used_at: NOW, used_by: 'acc-staff' },
    });
  });

  it.each([
    ['expirado', row({ expires_at: new Date(NOW.getTime() - 1) }), 'expired'],
    ['já usado', row({ used_at: new Date(NOW.getTime() - 1000) }), 'used'],
    ['segredo errado (forjado)', row({ secret_hash: createHash('sha256').update('outro').digest('hex') }), 'forged'],
    ['inexistente / de outra congregação', null, 'unknown'],
  ])('%s: recusa com o motivo só no retorno interno', async (_l, found, reason) => {
    const { svc, client } = build();
    client.kidsCheckinQrToken.findFirst.mockResolvedValue(found);
    expect(await svc.consumeCheckin(staff, qr)).toEqual({ ok: false, reason });
    expect(client.kidsCheckinQrToken.updateMany).not.toHaveBeenCalled();
  });

  it('corrida: dois leitores do mesmo QR — o segundo perde no UPDATE atômico', async () => {
    const { svc, client } = build();
    client.kidsCheckinQrToken.findFirst.mockResolvedValue(row());
    client.kidsCheckinQrToken.updateMany.mockResolvedValue({ count: 0 });
    expect(await svc.consumeCheckin(staff, qr)).toEqual({ ok: false, reason: 'used' });
  });

  it.each([
    ['sem prefixo', `${UUID}.${SECRET}`],
    ['prefixo do QR de check-out', `kidsco1.${UUID}.${SECRET}`],
    ['id que não é UUID', `kidsci1.x.${SECRET}`],
    ['segredo curto', `kidsci1.${UUID}.abc`],
    ['lixo', 'qualquer-coisa'],
    ['vazio', ''],
  ])('formato inválido (%s): recusa sem consultar o banco', async (_l, bad) => {
    const { svc, client } = build();
    expect(await svc.consumeCheckin(staff, bad)).toEqual({ ok: false, reason: 'malformed' });
    expect(client.kidsCheckinQrToken.findFirst).not.toHaveBeenCalled();
  });
});
