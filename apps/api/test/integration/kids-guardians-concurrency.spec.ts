/**
 * `PATCH /kids/guardians/:id` concorrente (COV-2). Invariante da spec (Cadastro
 * de criança e responsáveis, AC 4, e o desenho de KidsGuardiansService): a
 * criança sempre tem exatamente um responsável primário, mesmo com edições
 * simultâneas. Não há índice único no banco para isso — quem garante é o
 * `SELECT ... FOR UPDATE` das linhas da criança dentro da transação do PATCH.
 *
 * As corridas são reais (Promise.all contra o Postgres, uma transação por
 * requisição). Várias rodadas, porque um intercalamento ruim é questão de
 * tempo, e cada rodada recomeça de um estado conhecido.
 *
 * Roda em `teste2-church` (Premium). Apaga o que criou.
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kidsgc-${ts}`;
const ROUNDS = 12;

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let leader: string;
let leaderAccountId: string;
let child: string;
let people: string[] = [];
let rows: string[] = []; // KidsGuardian.id de A, B, C

const http = () => request(h.app.getHttpServer());
const patch = (rowId: string, body: Record<string, unknown>) =>
  http().patch(`/api/kids/guardians/${rowId}`).set({ Authorization: `Bearer ${leader}` }).send(body);

/** Estado conhecido: A primário; B e C autorizados. */
async function reset() {
  await admin.kidsGuardian.updateMany({ where: { child_id: child }, data: { is_primary: false } });
  await admin.kidsGuardian.update({ where: { id: rows[0] }, data: { is_primary: true } });
}
const primaries = () => admin.kidsGuardian.findMany({ where: { child_id: child, is_primary: true }, select: { id: true } });

beforeAll(async () => {
  h = await bootKids(admin, 'kids-gc');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  leader = h.tokenFor('ministry_leader');
  leaderAccountId = (h.app.get(JwtService).decode(leader) as { sub: string }).sub;

  for (const nome of ['A', 'B', 'C']) {
    people.push((await admin.person.create({ data: { ...scope, full_name: `Resp ${nome} ${tag}`, classification: 'member' } })).id);
  }
  const birth = new Date();
  birth.setUTCMonth(birth.getUTCMonth() - 36);
  child = (
    await admin.person.create({ data: { ...scope, full_name: `Criança ${tag}`, is_child: true, classification: 'attendee', birth_date: birth } })
  ).id;
  for (const [i, p] of people.entries()) {
    rows.push(
      (
        await admin.kidsGuardian.create({
          data: { ...scope, child_id: child, guardian_person_id: p, relationship: 'resp', can_pickup: true, is_primary: i === 0 },
        })
      ).id,
    );
  }
}, 120_000);

afterAll(async () => {
  await admin.auditLog.deleteMany({ where: { actor_user_id: leaderAccountId } });
  await admin.person.deleteMany({ where: { full_name: { endsWith: tag } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('PATCH /kids/guardians/:id concorrente', () => {
  it('duas promoções simultâneas a primário: a criança termina com exatamente um primário', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      await reset();
      const res = await Promise.all([patch(rows[1], { is_primary: true }), patch(rows[2], { is_primary: true })]);
      expect(res.map((r) => r.status)).toEqual([200, 200]);
      const prim = await primaries();
      expect(prim).toHaveLength(1);
      expect([rows[1], rows[2]]).toContain(prim[0].id);
    }
  }, 120_000);

  it('três promoções simultâneas (as duas autorizadas e a reafirmação do primário): um primário só', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      await reset();
      const res = await Promise.all([
        patch(rows[1], { is_primary: true }),
        patch(rows[2], { is_primary: true }),
        patch(rows[0], { is_primary: true }),
      ]);
      expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await primaries()).toHaveLength(1);
    }
  }, 120_000);

  it('promoção × rebaixamento do primário atual: nunca zero nem dois primários', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      await reset();
      const [promote, demote] = await Promise.all([patch(rows[1], { is_primary: true }), patch(rows[0], { is_primary: false })]);
      expect(promote.status).toBe(200);
      // Rebaixar só passa se já houver outro primário; senão a regra recusa (422).
      expect([200, 422]).toContain(demote.status);
      const prim = await primaries();
      expect(prim).toHaveLength(1);
      expect(prim[0].id).toBe(rows[1]);
    }
  }, 120_000);

  it('promoção × rebaixamento do primário × promoção de outra: invariante mantida', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      await reset();
      const res = await Promise.all([
        patch(rows[0], { is_primary: false }),
        patch(rows[1], { is_primary: true }),
        patch(rows[2], { is_primary: true }),
      ]);
      expect(res[1].status).toBe(200);
      expect(res[2].status).toBe(200);
      expect([200, 422]).toContain(res[0].status);
      expect(await primaries()).toHaveLength(1);
    }
  }, 120_000);
});
