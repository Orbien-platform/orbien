import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

export interface AbsenceAlertRow {
  tenant_id: string;
  congregation_id: string;
  small_group_id: string;
  group_name: string;
  leader_person_id: string;
  absent_count: bigint;
  meetings_considered: number;
}

/**
 * PROD-11 — a metade que empurra. `GET /small-groups/:id/absence-alerts`
 * (`SmallGroupsService.checkAbsenceAlerts`) já respondia quem faltou nas
 * últimas 3 reuniões, mas só quando alguém perguntava; o líder que não abre a
 * gaveta nunca ficava sabendo. Este job avisa uma vez por semana, por push,
 * o líder de cada célula que tem ausente.
 *
 * Roda como `prisma.system` (cross-tenant, BYPASSRLS) — não há request nem
 * tenant no contexto de um cron, mesmo motivo do `PersonsRetentionNotifier`.
 *
 * A definição de "ausente" está escrita duas vezes de propósito: aqui em SQL
 * porque varrer todos os tenants em N queries do Prisma não se paga, e lá em
 * Prisma porque a rota roda sob RLS com o contexto do request. As duas têm
 * que dizer a mesma coisa — tela e push divergindo é pior do que qualquer uma
 * das duas estar errada sozinha. São as mesmas regras: as 3 reuniões mais
 * recentes da célula (menos, se houver menos), ausente é quem não tem
 * `attendance_records` em nenhuma delas, célula sem reunião nenhuma não gera
 * alerta.
 */
@Injectable()
export class SmallGroupsAbsenceNotifier {
  private readonly logger = new Logger(SmallGroupsAbsenceNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Segunda de manhã, depois do aviso de retenção das 8h (nada compartilhado
  // entre os dois; é só não disputar a mesma janela). Semanal, não diário: o
  // alerta muda quando uma reunião é registrada, e célula reúne uma vez por
  // semana — mais frequente que isso repete o mesmo aviso sem informação nova.
  @Cron('0 9 * * 1')
  async cronNotifyAbsenceAlerts(): Promise<void> {
    const rows = await this.absencesByGroup();

    for (const row of rows) {
      try {
        await this.notifications.sendPush({
          tenantId: row.tenant_id,
          congregationId: row.congregation_id,
          contentPostId: null,
          title: `Faltas na ${row.group_name}`,
          body: this.buildBody(row),
          // Endereçado ao líder, não ao papel: `cell_leader` como tag pegaria
          // todo líder da congregação, e a falta é da célula dele. Mesmo
          // filtro do aviso de escala (`CelebrationAssignmentService`).
          filters: [{ field: 'tag', key: 'person_id', relation: '=', value: row.leader_person_id }],
          data: { type: 'absence_alert', small_group_id: row.small_group_id },
        });
      } catch (err) {
        this.logger.error(`Falha ao notificar a célula ${row.small_group_id}: ${String(err)}`);
      }
    }

    this.logger.log(`Alerta de ausência: ${rows.length} célula(s) com ausente(s)`);
  }

  private buildBody(row: AbsenceAlertRow): string {
    const people = Number(row.absent_count);
    const pessoas = people === 1 ? '1 membro' : `${people} membros`;
    // O texto conta quantas reuniões entraram na conta em vez de dizer "as
    // últimas 3" sempre: célula recém-criada tem 1 ou 2, e prometer 3 faria o
    // líder procurar uma reunião que não existe.
    const reunioes =
      row.meetings_considered === 1
        ? 'na última reunião'
        : `nas últimas ${row.meetings_considered} reuniões`;
    return `${pessoas} não ${people === 1 ? 'apareceu' : 'apareceram'} ${reunioes}.`;
  }

  private async absencesByGroup(): Promise<AbsenceAlertRow[]> {
    return this.prisma.system.$queryRaw<AbsenceAlertRow[]>(Prisma.sql`
      WITH recent_meetings AS (
        SELECT id, small_group_id
        FROM (
          SELECT
            gm.id,
            gm.small_group_id,
            row_number() OVER (
              PARTITION BY gm.small_group_id ORDER BY gm.occurred_at DESC
            ) AS rn
          FROM group_meetings gm
        ) ranked
        WHERE rn <= 3
      )
      SELECT
        sg.tenant_id,
        sg.congregation_id,
        sg.id AS small_group_id,
        sg.name AS group_name,
        sg.leader_person_id,
        count(*) AS absent_count,
        (SELECT count(*)::int FROM recent_meetings rm WHERE rm.small_group_id = sg.id)
          AS meetings_considered
      FROM small_groups sg
      JOIN group_memberships m ON m.small_group_id = sg.id
      WHERE EXISTS (SELECT 1 FROM recent_meetings rm WHERE rm.small_group_id = sg.id)
        AND NOT EXISTS (
          SELECT 1
          FROM attendance_records ar
          JOIN recent_meetings rm ON rm.id = ar.group_meeting_id
          WHERE rm.small_group_id = sg.id
            AND ar.person_id = m.person_id
        )
      GROUP BY sg.tenant_id, sg.congregation_id, sg.id, sg.name, sg.leader_person_id
    `);
  }
}
