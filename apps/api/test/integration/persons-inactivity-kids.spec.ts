/**
 * REV-1 contra o Postgres real: o responsável que usa o Kids não é anonimizado
 * por inatividade. Roda só em `teste2-church`; as pessoas criadas aqui são
 * envelhecidas por SQL e o `purgeInactivePersons` global é filtrado pelas
 * linhas do teste (o job é global, então só conferimos as nossas).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PersonsService } from '../../src/persons/persons.service';
import { PersonsRetentionNotifier } from '../../src/persons/persons-retention-notifier.service';
import { loadTestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const tag = `revkids-${Date.now()}`;
const OLD = new Date(Date.now() - 800 * 24 * 3600 * 1000); // ~26 meses: vencido p/ visitante e membro
const RECENT = new Date(Date.now() - 30 * 24 * 3600 * 1000);

let prisma: PrismaService;
let svc: PersonsService;
let scope: { tenant_id: string; congregation_id: string };
let accountId: string;
let sessionId: string;
let instanceId: string;
let celebrationId: string;
let roomId: string;
let childId: string;
let childIdle: string;
const ids: Record<string, string> = {};
let n = 0;

async function person(key: string, data: Record<string, unknown> = {}) {
  const p = await admin.person.create({
    data: { ...scope, full_name: `${key} ${tag}`, classification: 'visitor', ...data } as never,
  });
  ids[key] = p.id;
  await admin.$executeRaw`UPDATE persons SET created_at = ${OLD}, updated_at = ${OLD} WHERE id = ${p.id}`;
}

async function checkin(guardianKey: string, at: Date, extra: Record<string, unknown> = {}) {
  n += 1;
  // Um check-in por criança por culto: cada chamada usa uma criança nova,
  // salvo quando `extra.child_id` fixa uma.
  const child_id =
    (extra['child_id'] as string | undefined) ??
    (await admin.person.create({ data: { ...scope, full_name: `Filho${n} ${tag}`, is_child: true, classification: 'attendee' } })).id;
  await admin.kidsCheckin.create({
    data: {
      ...scope,
      session_id: sessionId,
      celebration_instance_id: instanceId,
      child_id,
      guardian_person_id: ids[guardianKey]!,
      code: `V${String(n).padStart(3, '0')}`,
      checked_in_at: at,
      checked_in_by: accountId,
      ...extra,
    } as never,
  });
}

beforeAll(async () => {
  prisma = new PrismaService();
  // O job é global; roda o SQL real, mas só age nas linhas deste teste (não
  // anonimiza outras pessoas de teste2-church do banco local).
  const realSystem = prisma.system;
  const scoped = {
    $queryRaw: async (...args: unknown[]) => {
      const rows = (await (realSystem.$queryRaw as (...a: unknown[]) => Promise<Array<{ id: string }>>)(...args)) ?? [];
      const mine = new Set(Object.values(ids));
      return rows.filter((r) => mine.has(r.id));
    },
    person: realSystem.person,
  };
  svc = new PersonsService({ system: scoped } as unknown as PrismaService, {} as never);
  const t2 = await loadTestTenant(admin, 'teste2-church');
  scope = { tenant_id: t2.tenantId, congregation_id: t2.congregationId };
  accountId = (
    await admin.userAccount.create({ data: { ...scope, email: `${tag}@teste2.fake`, password_hash: 'x', is_active: true } })
  ).id;

  await person('comCheckin'); // visitante, check-in recente como responsável
  await person('retirou'); // visitante que só retirou a criança
  await person('cadastrado'); // visitante, KidsGuardian de criança com check-in recente (check-in feito por outro)
  await person('cadastradoCriancaParada'); // KidsGuardian de criança sem check-in recente
  await person('semAtividade'); // nada
  await person('checkinAntigo'); // check-in de 26 meses
  await person('crianca', { is_child: true, classification: 'attendee' });
  childId = (await admin.person.create({ data: { ...scope, full_name: `Filho ${tag}`, is_child: true, classification: 'attendee' } })).id;
  childIdle = (await admin.person.create({ data: { ...scope, full_name: `Filho2 ${tag}`, is_child: true, classification: 'attendee' } })).id;
  await admin.$executeRaw`UPDATE persons SET created_at = ${OLD}, updated_at = ${OLD} WHERE id IN (${childId}, ${childIdle})`;

  celebrationId = (
    await admin.celebration.create({ data: { ...scope, name: `Culto ${tag}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' } })
  ).id;
  instanceId = (
    await admin.celebrationInstance.create({
      data: { ...scope, celebration_id: celebrationId, scheduled_date: new Date(), status: 'published' },
    })
  ).id;
  roomId = (await admin.kidsRoom.create({ data: { ...scope, name: `Sala ${tag}`, min_age_months: 0, max_age_months: 60 } })).id;
  sessionId = (await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instanceId, room_id: roomId } })).id;

  const kg = (child: string, key: string) =>
    admin.kidsGuardian.create({ data: { ...scope, child_id: child, guardian_person_id: ids[key]!, relationship: 'Pai' } });
  await kg(childId, 'cadastrado');
  await kg(childIdle, 'cadastradoCriancaParada');

  await checkin('comCheckin', RECENT);
  await checkin('retirou', RECENT, { guardian_person_id: ids['comCheckin']!, picked_up_by_person_id: ids['retirou']! });
  // Check-in recente feito por OUTRA pessoa, na criança de 'cadastrado'.
  await checkin('comCheckin', RECENT, { child_id: childId });
  await checkin('checkinAntigo', OLD);
}, 120_000);

afterAll(async () => {
  await admin.celebration.deleteMany({ where: { id: celebrationId } });
  await admin.kidsRoom.deleteMany({ where: { id: roomId } });
  // A purga renomeia para ANONIMIZADO: apaga por id, não por nome.
  await admin.person.deleteMany({ where: { OR: [{ full_name: { endsWith: tag } }, { id: { in: Object.values(ids) } }] } });
  await admin.userAccount.deleteMany({ where: { id: accountId } });
  await prisma.$disconnect();
  await admin.$disconnect();
}, 60_000);

const anonymized = async (key: string) =>
  (await admin.person.findUniqueOrThrow({ where: { id: ids[key]! } })).anonymized_at !== null;

describe('REV-1: atividade no Kids e retenção por inatividade (banco real)', () => {
  it('o aviso prévio deixa de contar quem tem atividade no Kids', async () => {
    const sendPush = jest.fn().mockResolvedValue(undefined);
    const notifier = new PersonsRetentionNotifier(prisma, { sendPush } as never);
    const bodyCount = async () => {
      sendPush.mockClear();
      await notifier.cronNotifyUpcomingRetentions();
      const call = sendPush.mock.calls.find((c) => c[0].congregationId === scope.congregation_id);
      return call ? Number(/^(\d+) pessoa/.exec(call[0].body)![1]) : 0;
    };
    const due = new Date(Date.now() - 362 * 24 * 3600 * 1000); // visitante vence em ~3 dias
    for (const key of ['avisoSem', 'avisoCom']) {
      await person(key);
      await admin.$executeRaw`UPDATE persons SET created_at = ${due}, updated_at = ${due} WHERE id = ${ids[key]!}`;
    }
    await checkin('avisoCom', RECENT);

    const comKids = await bodyCount();
    await admin.kidsCheckin.deleteMany({ where: { guardian_person_id: ids['avisoCom']! } });
    const semKids = await bodyCount();

    // Sem o check-in a pessoa entra no aviso; com ele, não.
    expect(semKids).toBe(comKids + 1);
  });

  it('anonimiza só quem não tem atividade: responsável com check-in recente, quem retirou e responsável cadastrado de criança ativa ficam', async () => {
    await svc.purgeInactivePersons();

    expect(await anonymized('comCheckin')).toBe(false);
    expect(await anonymized('retirou')).toBe(false);
    expect(await anonymized('cadastrado')).toBe(false);
    // Sem atividade nenhuma continua anonimizado, assim como quem só tem check-in antigo
    // e o responsável de criança sem check-in recente.
    expect(await anonymized('semAtividade')).toBe(true);
    expect(await anonymized('checkinAntigo')).toBe(true);
    expect(await anonymized('cadastradoCriancaParada')).toBe(true);
    // Criança segue fora da retenção por inatividade (AD-013).
    expect(await anonymized('crianca')).toBe(false);
  });
});
