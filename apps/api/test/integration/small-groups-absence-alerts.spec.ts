/**
 * Paridade entre as duas definições de "ausente" do PROD-11.
 *
 * A regra está escrita duas vezes de propósito: em Prisma, sob RLS, em
 * `SmallGroupsService.checkAbsenceAlerts` (a rota que a aba "Ausências"
 * chama), e em SQL, cross-tenant, em `SmallGroupsAbsenceNotifier` (o cron
 * semanal que empurra o push ao líder). Nenhuma das duas pode ser a fonte da
 * outra — a rota precisa do contexto do request, o cron não tem request
 * nenhum — então o que impede a divergência silenciosa é este arquivo: um
 * cenário só, as duas implementações, a mesma resposta exigida.
 *
 * O cenário é montado para exercer justamente onde elas poderiam divergir:
 * janela de 3 reuniões com uma quarta mais antiga fora dela, membro que
 * entrou depois das três (`PEND-06`), membro que entrou no meio da janela, e
 * presença registrada numa reunião anterior à entrada do membro — que não
 * vale como presença, assim como a falta dela não valeria como falta.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import { GroupMemberRole } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SmallGroupsService } from '../../src/small-groups/small-groups.service';
import { NotificationsService } from '../../src/content/notifications.service';
import {
  SmallGroupsAbsenceNotifier,
  type AbsenceAlertRow,
} from '../../src/small-groups/small-groups-absence.notifier';
import { prismaAdmin, runAsTenant } from '../helpers/rls';

const ts = Date.now();
const slug = `sg-absence-${ts}`;

let prismaService: PrismaService;
let service: SmallGroupsService;
let notifier: SmallGroupsAbsenceNotifier;

let tenantId: string;
let congregationId: string;

// Célula com 4 reuniões — a mais antiga fica fora da janela de 3.
let comReunioesId: string;
// Célula sem reunião nenhuma.
let semReuniaoId: string;
// Célula com uma única reunião.
let umaReuniaoId: string;

const personIds: Record<string, string> = {};

/** Data fixa e no passado — o cenário não pode depender de quando roda. */
function meetingDate(day: number): Date {
  return new Date(Date.UTC(2026, 0, day, 19, 0, 0));
}

async function addMember(groupId: string, personId: string, joinedAt: Date): Promise<void> {
  await prismaAdmin.groupMembership.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      small_group_id: groupId,
      person_id: personId,
      role: GroupMemberRole.member,
      joined_at: joinedAt,
    },
  });
}

beforeAll(async () => {
  const tenant = await prismaAdmin.tenant.create({ data: { slug, name: 'Tenant Ausências' } });
  tenantId = tenant.id;
  congregationId = (
    await prismaAdmin.congregation.create({
      data: { tenant_id: tenantId, name: 'Ausências — Sede' },
    })
  ).id;

  const groupType = await prismaAdmin.groupType.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Célula' },
  });

  const names = ['lider', 'presente', 'faltou', 'novato', 'meio', 'meioPresente', 'rejoinou'];
  for (const name of names) {
    const person = await prismaAdmin.person.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, full_name: name },
    });
    personIds[name] = person.id;
  }

  const group = (name: string) => ({
    tenant_id: tenantId,
    congregation_id: congregationId,
    name,
    group_type_id: groupType.id,
    leader_person_id: personIds['lider']!,
  });

  comReunioesId = (await prismaAdmin.smallGroup.create({ data: group('Com reuniões') })).id;
  semReuniaoId = (await prismaAdmin.smallGroup.create({ data: group('Sem reunião') })).id;
  umaReuniaoId = (await prismaAdmin.smallGroup.create({ data: group('Uma reunião') })).id;

  // Janela: dias 8, 15 e 22. O dia 1 é a quarta reunião, fora dela.
  const meetings: Record<string, string> = {};
  for (const day of [1, 8, 15, 22]) {
    const meeting = await prismaAdmin.groupMeeting.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        small_group_id: comReunioesId,
        occurred_at: meetingDate(day),
      },
    });
    meetings[`d${day}`] = meeting.id;
  }

  const unica = await prismaAdmin.groupMeeting.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      small_group_id: umaReuniaoId,
      occurred_at: meetingDate(22),
    },
  });

  const antesDeTudo = meetingDate(0);
  await addMember(comReunioesId, personIds['presente']!, antesDeTudo);
  await addMember(comReunioesId, personIds['faltou']!, antesDeTudo);
  // Entrou depois da última reunião: nenhuma das três se aplica a ele.
  await addMember(comReunioesId, personIds['novato']!, meetingDate(25));
  // Entrou entre a segunda e a terceira: só o dia 22 se aplica.
  await addMember(comReunioesId, personIds['meio']!, meetingDate(18));
  await addMember(comReunioesId, personIds['meioPresente']!, meetingDate(18));
  await addMember(comReunioesId, personIds['rejoinou']!, meetingDate(18));

  await addMember(semReuniaoId, personIds['faltou']!, antesDeTudo);
  await addMember(umaReuniaoId, personIds['faltou']!, antesDeTudo);

  const attendance = (meetingId: string, personId: string) => ({
    tenant_id: tenantId,
    congregation_id: congregationId,
    group_meeting_id: meetingId,
    person_id: personId,
  });

  await prismaAdmin.attendanceRecord.createMany({
    data: [
      // Apareceu na janela.
      attendance(meetings['d22']!, personIds['presente']!),
      attendance(meetings['d15']!, personIds['meioPresente']!),
      attendance(meetings['d22']!, personIds['meioPresente']!),
      // Só apareceu na reunião que ficou FORA da janela.
      attendance(meetings['d1']!, personIds['faltou']!),
      // Presença registrada ANTES de ele entrar na célula — não conta.
      attendance(meetings['d8']!, personIds['rejoinou']!),
    ],
  });

  // Reunião única sem nenhuma presença.
  void unica;

  prismaService = new PrismaService();
  await prismaService.onModuleInit();
  service = new SmallGroupsService(prismaService);
  notifier = new SmallGroupsAbsenceNotifier(prismaService, {
    sendPush: jest.fn(),
  } as unknown as NotificationsService);
}, 60_000);

afterAll(async () => {
  await prismaAdmin.attendanceRecord.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.groupMeeting.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.groupMembership.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.smallGroup.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.groupType.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.person.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.congregation.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.tenant.deleteMany({ where: { id: tenantId } });
  await prismaService?.$disconnect();
  await prismaAdmin.$disconnect();
}, 60_000);

/** A rota, sob RLS e com o contexto de tenant que o interceptor fixaria. */
async function pelaRota(groupId: string): Promise<string[]> {
  const people = await runAsTenant(tenantId, congregationId, (tx) =>
    prismaService.withTx(tx, () => service.checkAbsenceAlerts(groupId)),
  );
  return people.map((p) => p.id).sort();
}

/** O job, cross-tenant, sem push nenhum. */
async function peloJob(groupId: string): Promise<string[]> {
  const rows = await notifier.absencesByGroup();
  const row = rows.find((r) => r.small_group_id === groupId);
  return (row?.absent_person_ids ?? []).sort();
}

async function linhaDoJob(groupId: string): Promise<AbsenceAlertRow | undefined> {
  const rows = await notifier.absencesByGroup();
  return rows.find((r) => r.small_group_id === groupId);
}

describe('PROD-11 — rota e job concordam sobre quem está ausente', () => {
  it('lista os mesmos ausentes na célula com quatro reuniões', async () => {
    const esperado = [
      personIds['faltou']!, // só apareceu na reunião fora da janela
      personIds['meio']!, // entrou no meio, não apareceu na que lhe cabia
      personIds['rejoinou']!, // presença dele é anterior à entrada na célula
    ].sort();

    const rota = await pelaRota(comReunioesId);
    const job = await peloJob(comReunioesId);

    expect(rota).toEqual(esperado);
    expect(job).toEqual(esperado);
  });

  it('não acusa quem entrou depois das três reuniões (PEND-06)', async () => {
    const rota = await pelaRota(comReunioesId);
    const job = await peloJob(comReunioesId);

    expect(rota).not.toContain(personIds['novato']);
    expect(job).not.toContain(personIds['novato']);
  });

  it('não acusa quem apareceu na janela, tendo entrado antes ou no meio dela', async () => {
    const rota = await pelaRota(comReunioesId);
    const job = await peloJob(comReunioesId);

    for (const lista of [rota, job]) {
      expect(lista).not.toContain(personIds['presente']);
      expect(lista).not.toContain(personIds['meioPresente']);
    }
  });

  it('célula sem reunião nenhuma não gera alerta em nenhum dos dois lados', async () => {
    expect(await pelaRota(semReuniaoId)).toEqual([]);
    expect(await linhaDoJob(semReuniaoId)).toBeUndefined();
  });

  it('célula com uma reunião só usa a que tem, e o job informa isso', async () => {
    const esperado = [personIds['faltou']!];

    expect(await pelaRota(umaReuniaoId)).toEqual(esperado);

    const row = await linhaDoJob(umaReuniaoId);
    expect(row?.absent_person_ids.sort()).toEqual(esperado);
    expect(row?.meetings_considered).toBe(1);
  });
});
