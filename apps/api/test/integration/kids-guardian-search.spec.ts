/**
 * GET /kids/guardians/search por HTTP (R3-4): o líder kids (`ministry_leader`)
 * cadastra crianças mas não lê `GET /persons`; esta rota devolve só adultos da
 * congregação, com telefone mascarado. Roda como `app_user` (RLS ligado).
 *
 * Roda em `teste2-church` (Premium); `teste1-church` entra como "outro tenant".
 * Apaga o que criou.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kgs${ts}`;
const URL = '/api/kids/guardians/search';

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let otherCongregation: string | null = null;

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
type Hit = { id: string; full_name: string; phone_masked: string | null };
const search = (token: string, q: string) => http().get(URL).query({ q }).set(auth(token));

beforeAll(async () => {
  h = await bootKids(admin, 'kids-gsearch');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  const adult = (name: string, extra: Record<string, unknown> = {}) =>
    admin.person.create({ data: { ...scope, full_name: `${name} ${tag}`, classification: 'member', ...extra } });
  await adult('Adulta Ana', { phone: '(11) 98765-4321', email: `ana-${ts}@fake.test` });
  await adult('Adulta Bia', { phone: '11955550000' });
  await adult('Adulta Sem Fone');
  await adult('Adulta Removida', { deleted_at: new Date() });
  await admin.person.create({ data: { ...scope, full_name: `Adulta Criança ${tag}`, is_child: true, classification: 'attendee', birth_date: new Date('2022-01-01') } });
  // 25 adultos para provar o limite de 20.
  for (let i = 0; i < 25; i++) await adult(`Lote ${String(i).padStart(2, '0')}`);
  // Outro tenant: não pode aparecer.
  await admin.person.create({ data: { tenant_id: h.t1.tenantId, congregation_id: h.t1.congregationId, full_name: `Adulta Alheia ${tag}`, classification: 'member' } });
  const other = await admin.congregation.findFirst({ where: { tenant_id: scope.tenant_id, id: { not: scope.congregation_id } }, select: { id: true } });
  otherCongregation = other?.id ?? null;
  if (otherCongregation) {
    await admin.person.create({ data: { tenant_id: scope.tenant_id, congregation_id: otherCongregation, full_name: `Adulta Outra Cong ${tag}`, classification: 'member' } });
  }
}, 60_000);

afterAll(async () => {
  await admin.person.deleteMany({ where: { full_name: { endsWith: tag } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('GET /kids/guardians/search (R3-4)', () => {
  it('ministry_leader (que não lê GET /persons) acha o adulto pelo nome, sem caixa', async () => {
    const res = await search(h.tokenFor('ministry_leader'), `adulta ana ${tag}`);
    expect(res.status).toBe(200);
    expect((res.body as Hit[]).map((r) => r.full_name)).toEqual([`Adulta Ana ${tag}`]);
    const persons = await http().get('/api/persons').set(auth(h.tokenFor('ministry_leader')));
    expect(persons.status).toBe(403); // a razão de existir da rota
  });

  it('resposta mínima: id, nome e telefone mascarado — nada de e-mail, telefone inteiro ou dado sensível', async () => {
    const res = await search(h.tokenFor('ministry_leader'), `Adulta Ana ${tag}`);
    const hit = (res.body as Hit[])[0]!;
    expect(Object.keys(hit).sort()).toEqual(['full_name', 'id', 'phone_masked']);
    expect(hit.phone_masked).toBe('(**) *****-4321');
    expect(JSON.stringify(res.body)).not.toContain('98765');
    expect(JSON.stringify(res.body)).not.toContain('@fake.test');
  });

  it('acha por telefone (formatado ou só dígitos) e adulto sem telefone vem com phone_masked null', async () => {
    const byDigits = await search(h.tokenFor('pastor'), '119876');
    expect((byDigits.body as Hit[]).some((r) => r.full_name === `Adulta Ana ${tag}`)).toBe(true);
    const byRaw = await search(h.tokenFor('pastor'), '955550000');
    expect((byRaw.body as Hit[]).map((r) => r.full_name)).toContain(`Adulta Bia ${tag}`);
    const semFone = await search(h.tokenFor('pastor'), `Sem Fone ${tag}`);
    expect((semFone.body as Hit[])[0]!.phone_masked).toBeNull();
  });

  it('não devolve criança, pessoa removida, outro tenant nem outra congregação', async () => {
    const res = await search(h.tokenFor('ministry_leader'), tag);
    const names = (res.body as Hit[]).map((r) => r.full_name);
    expect(names.some((n) => n.startsWith('Adulta Criança'))).toBe(false);
    expect(names.some((n) => n.startsWith('Adulta Removida'))).toBe(false);
    expect(names.some((n) => n.startsWith('Adulta Alheia'))).toBe(false);
    expect(names.some((n) => n.startsWith('Adulta Outra Cong'))).toBe(false);
  });

  it('isolamento: o token do teste1 não enxerga adultos do teste2 (e vice-versa)', async () => {
    const t1 = await search(h.tokenT1('premium', 'ministry_leader'), tag);
    expect(t1.status).toBe(200);
    const names = (t1.body as Hit[]).map((r) => r.full_name);
    expect(names).toEqual([`Adulta Alheia ${tag}`]);
  });

  it('limite de 20 resultados, em ordem alfabética', async () => {
    const res = await search(h.tokenFor('ministry_leader'), `Lote`);
    const names = (res.body as Hit[]).map((r) => r.full_name);
    expect(names).toHaveLength(20);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it.each(['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'ministry_leader'])('%s pode buscar', async (role) => {
    expect((await search(h.tokenFor(role), `Ana ${tag}`)).status).toBe(200);
  });

  it.each(['member', 'volunteer', 'cell_leader', 'treasurer'])('%s recebe 403', async (role) => {
    expect((await search(h.tokenFor(role), `Ana ${tag}`)).status).toBe(403);
  });

  it('400 sem q ou com q de 1 caractere; plano Starter recebe 403', async () => {
    expect((await http().get(URL).set(auth(h.tokenFor('pastor')))).status).toBe(400);
    expect((await search(h.tokenFor('pastor'), 'a')).status).toBe(400);
    expect((await search(h.tokenT1('starter', 'pastor'), `Ana ${tag}`)).status).toBe(403);
  });

  it('401 sem token', async () => {
    expect((await http().get(URL).query({ q: 'ana' })).status).toBe(401);
  });
});
