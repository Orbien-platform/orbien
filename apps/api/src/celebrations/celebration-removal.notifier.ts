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
 * Avisa por push a quem foi tirado de uma escala já publicada (`PEND-20` trata
 * do mesmo buraco no cancelamento do culto). Falha de push nunca desfaz a
 * remoção: é fire-and-forget, como o aviso de publicação.
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
}
