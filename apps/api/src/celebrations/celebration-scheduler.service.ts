import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Celebration, CelebrationRecurrence, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, OneSignalFilter } from '../content/notifications.service';

interface TenantStats {
  created: number;
  skipped: number;
  errors: number;
}

export interface GenerateInstancesResult {
  celebrations_processed: number;
  tenants: Record<string, TenantStats>;
}

/** Quantos dias à frente as instâncias existem — do cron e do cadastro. */
export const UPCOMING_WINDOW_DAYS = 14;

type CelebrationWithLastInstance = Celebration & { instances: { scheduled_date: Date }[] };

export interface SendHostRemindersResult {
  instances_checked: number;
  sent: number;
  errors: number;
}

@Injectable()
export class CelebrationSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CelebrationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Geração na subida do processo ──────────────────────────────────────────
  //
  // A API roda no plano free do Render, que dorme após 15 min sem tráfego, e
  // um `@Cron` dentro de processo dormindo simplesmente não dispara — sem erro
  // e sem log. Quem acorda o processo é o primeiro request, então gerar na
  // subida é o que garante a janela em dia sempre que alguém usa o produto.
  // Idempotente: rodar de novo só pula o que já existe. Não bloqueia o boot —
  // o health check não espera por isto.

  onApplicationBootstrap(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    void this.generateInstances()
      .then((result) =>
        this.logger.log(
          `Boot run complete: ${result.celebrations_processed} celebrations processed — ${JSON.stringify(result.tenants)}`,
        ),
      )
      .catch((err: unknown) => this.logger.error(`Boot run failed: ${String(err)}`));
  }

  // ── Cron: generate instances every day at 06:00 ────────────────────────────
  //
  // Diário, e não semanal: com a janela de 14 dias, uma execução perdida (o
  // processo dormindo, um deploy no horário) é recuperada no dia seguinte, e
  // não só na outra semana.

  @Cron('0 6 * * *')
  async cronGenerateInstances(): Promise<void> {
    const result = await this.generateInstances();
    this.logger.log(
      `Scheduler run complete: ${result.celebrations_processed} celebrations processed — ${JSON.stringify(result.tenants)}`,
    );
  }

  // ── Cron: host reminders every day at 08:00 ────────────────────────────────

  @Cron('0 8 * * *')
  async cronSendHostReminders(): Promise<void> {
    const result = await this.sendHostReminders();
    this.logger.log(
      `Host reminders: instances_checked=${result.instances_checked} sent=${result.sent} errors=${result.errors}`,
    );
  }

  // ── Public methods (also called from the internal controller) ──────────────

  async generateInstances(): Promise<GenerateInstancesResult> {
    const today = this.startOfDayUtc(new Date());
    const windowEnd = this.addDays(today, UPCOMING_WINDOW_DAYS);

    // system client: BYPASSRLS — reads across all tenants without RLS context
    const celebrations = await this.prisma.system.celebration.findMany({
      where: { is_active: true, recurrence: { not: CelebrationRecurrence.none } },
      include: {
        // Last instance (any date) anchors the biweekly cycle
        instances: {
          orderBy: { scheduled_date: 'desc' },
          take: 1,
        },
      },
    });

    const tenants: Record<string, TenantStats> = {};

    for (const celebration of celebrations) {
      const tid = celebration.tenant_id;
      tenants[tid] ??= { created: 0, skipped: 0, errors: 0 };

      try {
        const stats = await this.generateFor(this.prisma.system, celebration, today, windowEnd);
        tenants[tid].created += stats.created;
        tenants[tid].skipped += stats.skipped;
      } catch (err) {
        tenants[tid].errors++;
        this.logger.error(
          `Error processing celebration ${celebration.id} (tenant=${tid}): ${String(err)}`,
        );
      }
    }

    return { celebrations_processed: celebrations.length, tenants };
  }

  /**
   * Gera as instâncias da janela para uma celebração só, dentro do request
   * (`prisma.client`: transação e RLS do tenant do usuário). É o que o
   * cadastro e a edição chamam, para a celebração nova não ficar com zero
   * instâncias até o próximo cron. Mesma regra de datas do cron, de propósito:
   * duas implementações de recorrência discordariam sobre o mesmo culto.
   */
  async generateUpcomingFor(tenantId: string, celebrationId: string): Promise<number> {
    const celebration = await this.prisma.client.celebration.findFirst({
      where: { id: celebrationId, tenant_id: tenantId },
      include: { instances: { orderBy: { scheduled_date: 'desc' }, take: 1 } },
    });
    if (!celebration?.is_active || celebration.recurrence === CelebrationRecurrence.none) return 0;

    const today = this.startOfDayUtc(new Date());
    const windowEnd = this.addDays(today, UPCOMING_WINDOW_DAYS);
    const { created } = await this.generateFor(this.prisma.client, celebration, today, windowEnd);
    return created;
  }

  private async generateFor(
    db: PrismaClient | Prisma.TransactionClient,
    celebration: CelebrationWithLastInstance,
    today: Date,
    windowEnd: Date,
  ): Promise<{ created: number; skipped: number }> {
    if (celebration.day_of_week === null) return { created: 0, skipped: 1 };

    const targetDates = this.computeTargetDates(
      celebration.recurrence,
      celebration.day_of_week,
      celebration.instances[0]?.scheduled_date ?? null,
      new Date(celebration.created_at),
      today,
      windowEnd,
    );

    let created = 0;
    let skipped = 0;
    for (const date of targetDates) {
      // Faixa do dia, e não igualdade: instância criada por outro fluxo
      // (`POST /celebrations/instances`, materialize) pode ter hora.
      const exists = await db.celebrationInstance.findFirst({
        where: {
          celebration_id: celebration.id,
          scheduled_date: { gte: date, lt: this.addDays(date, 1) },
        },
      });

      if (exists) {
        skipped++;
        continue;
      }

      await db.celebrationInstance.create({
        data: {
          tenant_id: celebration.tenant_id,
          congregation_id: celebration.congregation_id,
          celebration_id: celebration.id,
          scheduled_date: date,
          status: 'draft',
        },
      });

      created++;
      this.logger.log(
        `Created instance: celebration=${celebration.id} date=${this.isoDate(date)} tenant=${celebration.tenant_id}`,
      );
    }
    return { created, skipped };
  }

  async sendHostReminders(): Promise<SendHostRemindersResult> {
    const today = this.startOfDayUtc(new Date());
    const dayEnd = new Date(today.getTime() + 86_400_000 - 1);

    // system client: BYPASSRLS — cross-tenant scheduler
    const instances = await this.prisma.system.celebrationInstance.findMany({
      where: {
        status: 'published',
        scheduled_date: { gte: today, lte: dayEnd },
        host_reminder_sent_at: null,
      },
      include: {
        celebration: { select: { name: true, start_time: true } },
      },
    });

    let sent = 0;
    let errors = 0;

    for (const instance of instances) {
      try {
        const filters = this.buildHostRoleFilters(instance.congregation_id);

        await this.notifications.sendPush({
          tenantId: instance.tenant_id,
          congregationId: instance.congregation_id,
          contentPostId: null,
          title: 'Lembrete: Culto Hoje',
          body: `Hoje tem ${instance.celebration.name} às ${instance.celebration.start_time}. Acesse a OC no app.`,
          filters,
          data: { type: 'host_reminder', celebration_instance_id: instance.id },
        });

        await this.prisma.system.celebrationInstance.update({
          where: { id: instance.id },
          data: { host_reminder_sent_at: new Date() },
        });

        sent++;
        this.logger.log(`Host reminder sent: instance=${instance.id} congregation=${instance.congregation_id}`);
      } catch (err) {
        errors++;
        this.logger.error(`Host reminder failed for instance ${instance.id}: ${String(err)}`);
      }
    }

    return { instances_checked: instances.length, sent, errors };
  }

  // ---------------------------------------------------------------------------
  // Filter builders
  // ---------------------------------------------------------------------------

  /** (congregation_id=X AND role=R1) OR (congregation_id=X AND role=R2) … */
  private buildHostRoleFilters(congregationId: string): OneSignalFilter[] {
    const roles = ['admin_congregation', 'pastor', 'secretary'];
    return roles.flatMap((role, i) => {
      const pair: OneSignalFilter[] = [
        { field: 'tag', key: 'congregation_id', relation: '=', value: congregationId },
        { field: 'tag', key: 'role', relation: '=', value: role },
      ];
      return i === 0 ? pair : [{ operator: 'OR' }, ...pair];
    });
  }

  // ---------------------------------------------------------------------------
  // Date helpers
  // ---------------------------------------------------------------------------

  private computeTargetDates(
    recurrence: CelebrationRecurrence,
    dayOfWeek: number,
    lastInstanceDate: Date | null,
    celebrationCreatedAt: Date,
    today: Date,
    windowEnd: Date,
  ): Date[] {
    const dates: Date[] = [];

    switch (recurrence) {
      case CelebrationRecurrence.weekly: {
        // All occurrences of dayOfWeek in [today, windowEnd]
        let d = this.nextOrSameDayOfWeek(today, dayOfWeek);
        while (d <= windowEnd) {
          dates.push(d);
          d = this.addDays(d, 7);
        }
        break;
      }

      case CelebrationRecurrence.biweekly: {
        // Anchor: last instance date, or first occurrence of dayOfWeek from creation
        const anchor =
          lastInstanceDate !== null
            ? this.startOfDayUtc(lastInstanceDate)
            : this.nextOrSameDayOfWeek(celebrationCreatedAt, dayOfWeek);

        // Advance anchor in 14-day steps until we reach today or beyond
        let d = new Date(anchor.getTime());
        while (d < today) d = this.addDays(d, 14);

        while (d <= windowEnd) {
          dates.push(new Date(d));
          d = this.addDays(d, 14);
        }
        break;
      }

      case CelebrationRecurrence.monthly: {
        // First occurrence of dayOfWeek in current month and next month
        for (let offset = 0; offset <= 1; offset++) {
          const ref = new Date(today.getTime());
          ref.setUTCMonth(ref.getUTCMonth() + offset);
          const d = this.firstDayOfWeekInMonth(ref.getUTCFullYear(), ref.getUTCMonth(), dayOfWeek);
          if (d >= today && d <= windowEnd) dates.push(d);
        }
        break;
      }

      // CelebrationRecurrence.none is filtered at query level; guard here for exhaustiveness
      default:
        break;
    }

    return dates;
  }

  /** Returns `from` if already on `dayOfWeek`, else advances to the next occurrence. */
  private nextOrSameDayOfWeek(from: Date, dayOfWeek: number): Date {
    const d = this.startOfDayUtc(from);
    const currentDay = d.getUTCDay();
    const offset = (dayOfWeek - currentDay + 7) % 7;
    return this.addDays(d, offset);
  }

  /** First date in (UTC) month/year whose day-of-week equals `dayOfWeek`. */
  private firstDayOfWeekInMonth(year: number, month: number, dayOfWeek: number): Date {
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (dayOfWeek - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, month, 1 + offset));
  }

  private startOfDayUtc(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 86_400_000);
  }

  private isoDate(date: Date): string {
    return date.toISOString().split('T')[0]!;
  }
}
