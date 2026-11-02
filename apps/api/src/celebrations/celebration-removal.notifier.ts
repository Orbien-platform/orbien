import { Injectable, Logger } from '@nestjs/common';
import { AssignmentStatus, ScheduleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

interface RemovedAssignment {
  status: AssignmentStatus;
  notified_at: Date | null;
  volunteerProfile: { person_id: string };
}

/**
 * Quem deve saber que saiu da escala: só quem foi avisado de que estava nela.
 * Escala em rascunho não avisou ninguém (`notified_at` nulo), então tirar
 * alguém dela não é notícia. Recusado e trocado também ficam de fora — já não
 * contavam com a vaga.
 */
export function personsToNotifyOnRemoval(
  scheduleStatus: ScheduleStatus,
  assignments: RemovedAssignment[],
): string[] {
  if (scheduleStatus !== ScheduleStatus.published) return [];
  const ids = assignments
    .filter(
      (a) =>
        a.notified_at !== null &&
        (a.status === AssignmentStatus.pending || a.status === AssignmentStatus.confirmed),
    )
    .map((a) => a.volunteerProfile.person_id);
  return [...new Set(ids)];
}

/**
 * Quem estava escalado num culto e deve saber que ele saiu da agenda, lido
 * ANTES de a escala ser apagada (remoção) ou o culto mudar de estado. É dado
 * puro — o envio não volta ao banco para recompor nada, e por isso sobrevive
 * ao `deleteMany` da instância.
 */
export interface CancellationSnapshot {
  congregationId: string;
  celebrationName: string;
  /** `person_id` → datas (`YYYY-MM-DD`, ordenadas) dos cultos em que contava. */
  datesByPerson: Map<string, string[]>;
}

/** Datas listadas no corpo do push antes de virar "e mais N". */
const MAX_DATES_IN_BODY = 6;

function formatDay(isoDay: string): string {
  return `${isoDay.slice(8, 10)}/${isoDay.slice(5, 7)}`;
}

export function cancellationBody(celebrationName: string, days: string[]): string {
  if (days.length === 1) {
    return `${celebrationName} de ${formatDay(days[0])} foi cancelado. Você não precisa servir nesta data.`;
  }
  const shown = days.slice(0, MAX_DATES_IN_BODY).map(formatDay).join(', ');
  const rest = days.length > MAX_DATES_IN_BODY ? ` e mais ${days.length - MAX_DATES_IN_BODY}` : '';
  return `${celebrationName}: ${shown}${rest} foram cancelados. Você não precisa servir nessas datas.`;
}

/**
 * Avisa por push quem perde a vaga numa escala já publicada: quando a liderança
 * tira a pessoa (`PROD-39`) e quando o culto é cancelado ou removido
 * (`PEND-20`). Falha de push nunca desfaz a operação: é fire-and-forget, como
 * o aviso de publicação.
 */
@Injectable()
export class CelebrationRemovalNotifier {
  private readonly logger = new Logger(CelebrationRemovalNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  notifyRemoved(
    tenantId: string,
    congregationId: string,
    instanceId: string,
    personIds: string[],
  ): void {
    if (personIds.length === 0) return;
    this.send(tenantId, congregationId, instanceId, personIds).catch((err: unknown) =>
      this.logger.error(`Falha ao avisar remoção da escala (instância ${instanceId}): ${String(err)}`),
    );
  }

  private async send(
    tenantId: string,
    congregationId: string,
    instanceId: string,
    personIds: string[],
  ): Promise<void> {
    const instance = await this.prisma.client.celebrationInstance.findFirst({
      where: { id: instanceId, tenant_id: tenantId },
      select: { scheduled_date: true, celebration: { select: { name: true } } },
    });
    if (!instance) return;

    const dateLabel = instance.scheduled_date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    });

    await this.notifications.sendPushToPersons(
      {
        tenantId,
        congregationId,
        contentPostId: null,
        title: 'Você saiu da escala',
        body: `${instance.celebration.name} de ${dateLabel}: a liderança removeu você desta escala.`,
        data: { type: 'celebration_assignment_removed', instance_id: instanceId },
      },
      personIds,
    );
  }

  /**
   * Lê quem estava escalado nas instâncias dadas. Mesma regra de
   * `personsToNotifyOnRemoval`: escala publicada, pessoa já avisada
   * (`notified_at`) e ainda contando com a vaga (`pending`/`confirmed`).
   * Chamar ANTES de apagar a instância — a escala vai junto no cascade.
   * Best-effort: falha na leitura vira `null` e a operação segue.
   */
  async snapshotCancellation(
    tenantId: string,
    celebrationName: string,
    congregationId: string,
    instanceIds: string[],
  ): Promise<CancellationSnapshot | null> {
    if (instanceIds.length === 0) return null;
    try {
      const rows = await this.prisma.client.celebrationAssignment.findMany({
        where: {
          tenant_id: tenantId,
          notified_at: { not: null },
          status: { in: [AssignmentStatus.pending, AssignmentStatus.confirmed] },
          celebrationMinistry: {
            schedule: {
              status: ScheduleStatus.published,
              celebration_instance_id: { in: instanceIds },
            },
          },
        },
        select: {
          volunteerProfile: { select: { person_id: true } },
          celebrationMinistry: {
            select: { schedule: { select: { celebrationInstance: { select: { scheduled_date: true } } } } },
          },
        },
      });

      const datesByPerson = new Map<string, string[]>();
      for (const row of rows) {
        const day = row.celebrationMinistry.schedule.celebrationInstance.scheduled_date
          .toISOString()
          .slice(0, 10);
        const personId = row.volunteerProfile.person_id;
        const days = datesByPerson.get(personId) ?? [];
        if (!days.includes(day)) days.push(day);
        datesByPerson.set(personId, days);
      }
      for (const days of datesByPerson.values()) days.sort();

      if (datesByPerson.size === 0) return null;
      return { congregationId, celebrationName, datesByPerson };
    } catch (err: unknown) {
      this.logger.error(`Falha ao ler quem estava escalado (cancelamento do culto): ${String(err)}`);
      return null;
    }
  }

  /**
   * Um aviso por pessoa, com todas as datas dela. Pessoas com o mesmo conjunto
   * de datas saem na mesma chamada. Respeita a preferência `avisos`.
   */
  notifyCancelled(tenantId: string, snapshot: CancellationSnapshot | null): void {
    if (!snapshot || snapshot.datesByPerson.size === 0) return;
    // `sendCancelled` não rejeita: cada envio tem o próprio try/catch.
    void this.sendCancelled(tenantId, snapshot);
  }

  private async sendCancelled(tenantId: string, snapshot: CancellationSnapshot): Promise<void> {
    const byDates = new Map<string, { days: string[]; personIds: string[] }>();
    for (const [personId, days] of snapshot.datesByPerson) {
      const key = days.join(',');
      const group = byDates.get(key) ?? { days, personIds: [] };
      group.personIds.push(personId);
      byDates.set(key, group);
    }

    for (const { days, personIds } of byDates.values()) {
      try {
        await this.notifications.sendPushToPersons(
          {
            tenantId,
            congregationId: snapshot.congregationId,
            contentPostId: null,
            title: 'Culto cancelado',
            body: cancellationBody(snapshot.celebrationName, days),
            data: { type: 'celebration_cancelled' },
          },
          personIds,
          'avisos',
        );
      } catch (err: unknown) {
        // Um grupo que falha não impede os demais de serem avisados.
        this.logger.error(`Falha ao avisar cancelamento do culto (${days.join(',')}): ${String(err)}`);
      }
    }
  }
}
