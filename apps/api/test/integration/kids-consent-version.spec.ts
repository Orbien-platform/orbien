/**
 * REV-4.5: o consentimento do Kids é da versão vigente do termo. Aceite de versão
 * anterior vale como ausente (`valid: false`, `outdated: true`), o novo aceite
 * revoga o antigo como histórico (não apaga) e cria o vigente.
 *
 * Roda em `teste2-church`. Apaga o que criou.
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';
import { KIDS_TERM_VERSION } from '../../src/kids/consent/kids-consent.terms';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const tag = `kidscv-${Date.now()}`;

let h: KidsHarness;
let leader: string;
let leaderAccountId: string;
let guardian: string;

const http = () => request(h.app.getHttpServer());
const auth = () => ({ Authorization: `Bearer ${leader}` });
const status = () => http().get(`/api/kids/consent?guardian_person_id=${guardian}`).set(auth());
const accept = () =>
  http().post('/api/kids/consent').set(auth()).send({ guardian_person_id: guardian, term_version: KIDS_TERM_VERSION });
const records = () => admin.consentRecord.findMany({ where: { person_id: guardian, origin: { in: ['kids', 'secretaria'] } } });

beforeAll(async () => {
  h = await bootKids(admin, 'kids-cv');
  leader = h.tokenFor('ministry_leader');
  leaderAccountId = (h.app.get(JwtService).decode(leader) as { sub: string }).sub;
  guardian = (
    await admin.person.create({
      data: { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId, full_name: `Resp ${tag}`, classification: 'member' },
    })
  ).id;
}, 120_000);

afterAll(async () => {
  await admin.auditLog.deleteMany({ where: { actor_user_id: leaderAccountId } });
  await admin.consentRecord.deleteMany({ where: { person_id: guardian } });
  await admin.person.deleteMany({ where: { full_name: { endsWith: tag } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('consentimento Kids × versão do termo (REV-4.5)', () => {
  it('sem aceite: valid false e não é outdated', async () => {
    const res = await status();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: false, outdated: false, term_version: KIDS_TERM_VERSION });
  });

  it('aceite da versão vigente vale', async () => {
    expect((await accept()).status).toBe(201);
    expect((await status()).body).toMatchObject({ valid: true, outdated: false });
  });

  it('aceite de versão anterior vira ausente (outdated) e o novo aceite o substitui sem apagar', async () => {
    await admin.consentRecord.updateMany({ where: { person_id: guardian }, data: { version: 'kids-antigo' } });
    expect((await status()).body).toMatchObject({ valid: false, outdated: true });

    expect((await accept()).status).toBe(201);
    expect((await status()).body).toMatchObject({ valid: true, outdated: false });

    const all = await records();
    expect(all).toHaveLength(2);
    const old = all.find((r) => r.version === 'kids-antigo');
    expect(old?.revoked_at).not.toBeNull();
    expect(old?.revocation_reason).toBe('superseded_by_new_term');
    expect(all.filter((r) => r.revoked_at === null)).toHaveLength(1);
  });
});
