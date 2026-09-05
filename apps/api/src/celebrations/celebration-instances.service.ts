import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CelebrationInstance, CelebrationInstanceStatus, CelebrationRecurrence } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCelebrationInstanceDto } from './dto/create-celebration-instance.dto';
import { UpdateCelebrationInstanceDto } from './dto/update-celebration-instance.dto';
import { ListCelebrationInstancesQueryDto } from './dto/list-celebration-instances-query.dto';

@Injectable()
export class CelebrationInstancesService {
  private readonly logger = new Logger(CelebrationInstancesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateCelebrationInstanceDto,
  ): Promise<CelebrationInstance> {
    const celebration = await this.prisma.client.celebration.findFirst({
      where: { id: dto.celebration_id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!celebration) throw new NotFoundException('Celebração não encontrada');

    return this.prisma.client.celebrationInstance.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        celebration_id: dto.celebration_id,
        scheduled_date: new Date(dto.scheduled_date),
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(
    tenantId: string,
    query: ListCelebrationInstancesQueryDto,
  ): Promise<CelebrationInstance[]> {
    // Sem `congregation_id` no `where` — mesmo motivo de `CelebrationsService.findAll`:
    // quem decide o alcance é a RLS, que abre a congregação inteira do tenant
    // para `tenant_admin`/`denomination_admin`.
    return this.prisma.client.celebrationInstance.findMany({
      where: {
        tenant_id: tenantId,
        ...(query.celebration_id && { celebration_id: query.celebration_id }),
        ...(query.status && { status: query.status as CelebrationInstanceStatus }),
        ...(query.date_from || query.date_to
          ? {
              scheduled_date: {
                ...(query.date_from && { gte: new Date(query.date_from) }),
                ...(query.date_to && { lte: new Date(query.date_to) }),
              },
            }
          : {}),
      },
      orderBy: { scheduled_date: 'asc' },
      include: {
        celebration: { select: { id: true, name: true, type: true } },
        serviceOrder: { select: { id: true, title: true, published_at: true } },
        // Permite saber se a instância já tem escala e em que estado,
        // sem uma chamada por instância.
        schedule: { select: { id: true, status: true } },
      },
    });
  }

  async findOne(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<CelebrationInstance> {
    const instance = await this.prisma.client.celebrationInstance.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        celebration: { select: { id: true, name: true, type: true } },
        serviceOrder: { select: { id: true, title: true, published_at: true } },
        // Permite saber se a instância já tem escala e em que estado,
        // sem uma chamada por instância.
        schedule: { select: { id: true, status: true } },
      },
    });
    if (!instance) throw new NotFoundException('Instância não encontrada');
    return instance;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateCelebrationInstanceDto,
  ): Promise<CelebrationInstance> {
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.client.celebrationInstance.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  async remove(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<CelebrationInstance> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.celebrationInstance.delete({ where: { id } });
  }

  // Materializes CelebrationInstance rows for a Celebration over [from, to].
  // - recurrence "none" (avulsa/evento): guarantees exactly one instance ever exists.
  // - recurring (weekly/biweekly/monthly): get-or-create one instance per computed date,
  //   idempotent against instances already created via other flows (e.g. a ServiceOrder).
  async materializeInstancesForPeriod(
    tenantId: string,
    congregationId: string,
    celebrationId: string,
    from: Date,
    to: Date,
  ): Promise<CelebrationInstance[]> {
    const celebration = await this.prisma.client.celebration.findFirst({
      where: { id: celebrationId, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!celebration) throw new NotFoundException('Celebração não encontrada');

    if (this.toUtcDateOnly(from) > this.toUtcDateOnly(to)) {
      throw new BadRequestException('"from" deve ser anterior ou igual a "to"');
    }

    if (celebration.recurrence === 'none') {
      const existing = await this.prisma.client.celebrationInstance.findFirst({
        where: { tenant_id: tenantId, congregation_id: congregationId, celebration_id: celebrationId },
        orderBy: { scheduled_date: 'asc' },
      });
      if (existing) return [existing];

      const created = await this.prisma.client.celebrationInstance.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          celebration_id: celebrationId,
          scheduled_date: this.toUtcDateOnly(from),
        },
      });
      return [created];
    }

    const anchorDate = await this.resolveAnchorDate(
      tenantId,
      congregationId,
      celebrationId,
      celebration.recurrence,
      celebration.anchor_date,
      from,
    );

    const dates = this.computeRecurrenceDates(celebration.recurrence, celebration.day_of_week, anchorDate, from, to);

    return this.prisma.runInTx(async () => {
      const results: CelebrationInstance[] = [];
      for (const scheduledDate of dates) {
        const dayEnd = new Date(scheduledDate);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

        const existing = await this.prisma.client.celebrationInstance.findFirst({
          where: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            celebration_id: celebrationId,
            scheduled_date: { gte: scheduledDate, lt: dayEnd },
          },
        });

        results.push(
          existing ??
            (await this.prisma.client.celebrationInstance.create({
              data: {
                tenant_id: tenantId,
                congregation_id: congregationId,
                celebration_id: celebrationId,
                scheduled_date: scheduledDate,
              },
            })),
        );
      }
      return results.sort((a, b) => a.scheduled_date.getTime() - b.scheduled_date.getTime());
    });
  }

  private toUtcDateOnly(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  // Resolves the recurrence anchor for biweekly/monthly cycles (weekly doesn't need one).
  // Priority: Celebration.anchor_date > scheduled_date of the earliest existing instance >
  // `from` (fallback, logged — shifts which weeks/months are "on-cycle" if called again later
  // with a different `from` before a real anchor_date is set).
  private async resolveAnchorDate(
    tenantId: string,
    congregationId: string,
    celebrationId: string,
    recurrence: CelebrationRecurrence,
    anchorDate: Date | null,
    from: Date,
  ): Promise<Date | null> {
    if (recurrence === 'weekly') return null;
    if (anchorDate) return this.toUtcDateOnly(anchorDate);

    const firstInstance = await this.prisma.client.celebrationInstance.findFirst({
      where: { tenant_id: tenantId, congregation_id: congregationId, celebration_id: celebrationId },
      orderBy: { scheduled_date: 'asc' },
    });
    if (firstInstance) return this.toUtcDateOnly(firstInstance.scheduled_date);

    const fallback = this.toUtcDateOnly(from);
    this.logger.warn(
      `Celebração ${celebrationId} (${recurrence}) sem anchor_date e sem instâncias existentes; ` +
        `usando "from" (${fallback.toISOString()}) como âncora de fallback.`,
    );
    return fallback;
  }

  private computeRecurrenceDates(
    recurrence: CelebrationRecurrence,
    dayOfWeek: number | null,
    anchorDate: Date | null,
    from: Date,
    to: Date,
  ): Date[] {
    if (dayOfWeek === null) {
      throw new BadRequestException('Celebração recorrente sem day_of_week definido');
    }

    const start = this.toUtcDateOnly(from);
    const end = this.toUtcDateOnly(to);

    if (recurrence === 'weekly') {
      return this.datesForWeekday(dayOfWeek, start, end);
    }
    if (recurrence === 'biweekly') {
      return this.datesForBiweekly(anchorDate!, start, end);
    }
    return this.datesForMonthlyByPosition(anchorDate!, dayOfWeek, start, end);
  }

  // weekly: toda ocorrência de day_of_week em [start, end] — não depende de âncora.
  private datesForWeekday(dayOfWeek: number, start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const firstMatch = new Date(start);
    const offset = (dayOfWeek - firstMatch.getUTCDay() + 7) % 7;
    firstMatch.setUTCDate(firstMatch.getUTCDate() + offset);

    for (const d = new Date(firstMatch); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
      dates.push(new Date(d));
    }
    return dates;
  }

  // biweekly: anchor + N*14 dias que caiam em [start, end].
  private datesForBiweekly(anchor: Date, start: Date, end: Date): Date[] {
    const msPerDay = 24 * 60 * 60 * 1000;
    if (anchor > end) return [];

    const diffDays = Math.floor((start.getTime() - anchor.getTime()) / msPerDay);
    const cycles = Math.ceil(diffDays / 14);
    const cursor = new Date(anchor);
    cursor.setUTCDate(cursor.getUTCDate() + cycles * 14);
    while (cursor < start) cursor.setUTCDate(cursor.getUTCDate() + 14);

    const dates: Date[] = [];
    for (const d = new Date(cursor); d <= end; d.setUTCDate(d.getUTCDate() + 14)) {
      dates.push(new Date(d));
    }
    return dates;
  }

  // monthly: N-ésima ocorrência de dayOfWeek no mês, onde N é a posição do anchor_date
  // dentro do seu próprio mês (1ª, 2ª, 3ª, 4ª ou última) — replicada em cada mês de [start, end].
  private datesForMonthlyByPosition(anchor: Date, dayOfWeek: number, start: Date, end: Date): Date[] {
    const { ordinal, isLast } = this.weekdayPositionInMonth(anchor);

    const dates: Date[] = [];
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const endCursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

    while (cursor <= endCursor) {
      const match = this.nthWeekdayOfMonth(cursor.getUTCFullYear(), cursor.getUTCMonth(), dayOfWeek, ordinal, isLast);
      if (match >= start && match <= end) dates.push(match);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return dates;
  }

  // Posição do dia-da-semana de `date` dentro do seu mês: 1..4, e se é a última ocorrência.
  // (ordinal só pode chegar a 5 quando isLast também é true, já que dia 29-31 + 7 sempre
  // cai no mês seguinte — por isso o branch "not last" de nthWeekdayOfMonth nunca ultrapassa 4).
  private weekdayPositionInMonth(date: Date): { ordinal: number; isLast: boolean } {
    const ordinal = Math.ceil(date.getUTCDate() / 7);
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 7);
    const isLast = next.getUTCMonth() !== date.getUTCMonth();
    return { ordinal, isLast };
  }

  private nthWeekdayOfMonth(year: number, month: number, dayOfWeek: number, ordinal: number, isLast: boolean): Date {
    if (isLast) {
      const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0));
      const offset = (lastDayOfMonth.getUTCDay() - dayOfWeek + 7) % 7;
      lastDayOfMonth.setUTCDate(lastDayOfMonth.getUTCDate() - offset);
      return lastDayOfMonth;
    }

    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const offsetToFirstMatch = (dayOfWeek - firstOfMonth.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, month, 1 + offsetToFirstMatch + (ordinal - 1) * 7));
  }
}
