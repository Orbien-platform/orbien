import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CelebrationRecurrence } from '@prisma/client';
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

export interface SendHostRemindersResult {
  instances_checked: number;
  sent: number;
  errors: number;
}

@Injectable()
export class CelebrationSchedulerService {
  private readonly logger = new Logger(CelebrationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Cron: generate instances every Sunday at 06:00 ─────────────────────────

  @Cron('0 6 * * 0')
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
    const windowEnd = this.addDays(today, 14);

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
        if (celebration.day_of_week === null) {
          tenants[tid].skipped++;
          continue;
        }

        const targetDates = this.computeTargetDates(
          celebration.recurrence,
          celebration.day_of_week,
          celebration.instances[0]?.scheduled_date ?? null,
          new Date(celebration.created_at),
          today,
          windowEnd,
        );

        for (const date of targetDates) {
          const exists = await this.prisma.system.celebrationInstance.findFirst({
            where: { celebration_id: celebration.id, scheduled_date: date },
          });

          if (exists) {
            tenants[tid].skipped++;
            continue;
          }

          await this.prisma.system.celebrationInstance.create({
            data: {
              tenant_id: celebration.tenant_id,
              congregation_id: celebration.congregation_id,
              celebration_id: celebration.id,
              scheduled_date: date,
              status: 'draft',
            },
          });

          tenants[tid].created++;
          this.logger.log(
            `Created instance: celebration=${celebration.id} date=${this.isoDate(date)} tenant=${tid}`,
          );
        }
      } catch (err) {
        tenants[tid].errors++;
        this.logger.error(
          `Error processing celebration ${celebration.id} (tenant=${tid}): ${String(err)}`,
        );
      }
    }

    return { celebrations_processed: celebrations.length, tenants };
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
