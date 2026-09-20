import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AudienceSegment, ContentPost, NotificationChannel, NotificationDispatch, NotificationStatus, Prisma } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { CATEGORY_BY_POST_TYPE, NotificationCategory } from './notification-categories';

interface SegmentCriteria {
  congregation_ids?: string[];
  group_ids?: string[];
  roles?: string[];
  // age_range and ministry_ids intentionally omitted — no OneSignal tag for these

  // ── Comportamento/engajamento/inatividade (PROD-17, Premium) ─────────────
  // Sem equivalente em tag do OneSignal — resolvidos por consulta direta em
  // `resolveExternalUserIds`, nunca por `buildFilters`. Um segmento com
  // qualquer um destes três muda o dispatch inteiro (todos os segmentos da
  // chamada, básicos inclusive) do modo "filtro de tag" para o modo "lista
  // de external_user_ids" — ver `hasBehaviorCriteria`.
  inactive_since?: { days: number };
  group_attendance_gap?: { days: number };
  high_engagement?: { days: number; min_events: number };
}

function hasBehaviorCriteria(criteria: SegmentCriteria): boolean {
  return Boolean(
    criteria.inactive_since || criteria.group_attendance_gap || criteria.high_engagement,
  );
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export type OneSignalFilter =
  | { field: 'tag'; key: string; relation: '=' | '!='; value: string }
  | { operator: 'OR' };

export interface SendPushOpts {
  tenantId: string;
  congregationId: string;
  contentPostId: string | null;
  title: string;
  body: string;
  filters: OneSignalFilter[];
  data: Record<string, string>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyPost(
    post: ContentPost & { tenant_id: string; congregation_id: string },
    segments: AudienceSegment[],
  ): Promise<void> {
    const body = post.body ? post.body.slice(0, 200) : post.title;
    const category = CATEGORY_BY_POST_TYPE[post.type];
    const data = { post_id: post.id, type: post.type as string };

    if (this.hasAdvancedSegment(segments)) {
      const externalUserIds = await this.resolveExternalUserIds(segments, post.tenant_id, category);
      await this.dispatch({
        tenantId: post.tenant_id,
        congregationId: post.congregation_id,
        contentPostId: post.id,
        title: post.title,
        body,
        externalUserIds,
        data,
      });
      return;
    }

    const filters = this.buildFilters(segments, post.tenant_id);
    filters.push({
      field: 'tag',
      key: `pref_${category}`,
      relation: '!=',
      value: 'false',
    });

    await this.dispatch({
      tenantId: post.tenant_id,
      congregationId: post.congregation_id,
      contentPostId: post.id,
      title: post.title,
      body,
      filters,
      data,
    });
  }

  async sendManualNotification(
    tenantId: string,
    congregationId: string,
    dto: SendNotificationDto,
  ): Promise<void> {
    let segments: AudienceSegment[] = [];

    if (dto.segment_ids.length) {
      segments = await this.prisma.system.audienceSegment.findMany({
        where: { id: { in: dto.segment_ids }, tenant_id: tenantId },
      });
    }

    const title = dto.title;
    const body = dto.body.slice(0, 200);

    if (this.hasAdvancedSegment(segments)) {
      const externalUserIds = await this.resolveExternalUserIds(segments, tenantId);
      await this.dispatch({
        tenantId,
        congregationId,
        contentPostId: null,
        title,
        body,
        externalUserIds,
        data: {},
      });
      return;
    }

    const filters = this.buildFilters(segments, tenantId);

    await this.dispatch({
      tenantId,
      congregationId,
      contentPostId: null,
      title,
      body,
      filters,
      data: {},
    });
  }

  // ── Direct push (used by cross-module callers like CelebrationAssignmentService) ─────

  async sendPush(opts: SendPushOpts): Promise<void> {
    await this.dispatch(opts);
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  @Cron('*/30 * * * *')
  async syncNotificationMetrics(): Promise<void> {
    await this.syncMetrics();
  }

  async syncMetrics(): Promise<void> {
    const appId = process.env['ONESIGNAL_APP_ID'];
    const apiKey = process.env['ONESIGNAL_API_KEY'];

    if (!appId) return;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const pending = await this.prisma.system.notificationDispatch.findMany({
      where: {
        onesignal_id: { not: null },
        channel: NotificationChannel.push,
        sent_at: { gte: since },
        OR: [{ reached: null }, { opened: null }],
      },
      take: 10,
    });

    for (const dispatch of pending) {
      try {
        const res = await fetch(
          `https://onesignal.com/api/v1/notifications/${dispatch.onesignal_id}?app_id=${appId}`,
          { headers: { Authorization: `Basic ${apiKey}` } },
        );

        if (!res.ok) {
          this.logger.warn(`syncMetrics: OneSignal ${res.status} para dispatch ${dispatch.id}`);
          continue;
        }

        const json = (await res.json()) as { successful?: number; converted?: number };

        await this.prisma.system.notificationDispatch.update({
          where: { id: dispatch.id },
          data: {
            reached: json.successful ?? null,
            opened: json.converted ?? null,
          },
        });

        this.logger.log(`syncMetrics: dispatch ${dispatch.id} reached=${json.successful} opened=${json.converted}`);
      } catch (err) {
        this.logger.error(`syncMetrics: falha no dispatch ${dispatch.id}: ${String(err)}`);
      }
    }
  }

  async getMetrics(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<NotificationDispatch & { title: string | null }> {
    const dispatch = await this.prisma.client.notificationDispatch.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: { contentPost: { select: { title: true } } },
    });

    if (!dispatch) throw new NotFoundException('Dispatch não encontrado');

    const { contentPost, ...rest } = dispatch as typeof dispatch & { contentPost: { title: string } | null };
    return { ...rest, title: contentPost?.title ?? null };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private buildFilters(segments: AudienceSegment[], tenantId: string): OneSignalFilter[] {
    if (!segments.length) {
      return [{ field: 'tag', key: 'tenant_id', relation: '=', value: tenantId }];
    }

    const perSegment: OneSignalFilter[][] = segments.map((seg) => {
      const criteria = (seg.criteria ?? {}) as SegmentCriteria;
      const parts: OneSignalFilter[][] = [];

      if (criteria.congregation_ids?.length) {
        parts.push(
          this.orGroup(
            criteria.congregation_ids.map((id) => ({
              field: 'tag' as const,
              key: 'congregation_id',
              relation: '=' as const,
              value: id,
            })),
          ),
        );
      }

      if (criteria.group_ids?.length) {
        parts.push(
          this.orGroup(
            criteria.group_ids.map((id) => ({
              field: 'tag' as const,
              key: 'pg_ids',
              relation: '=' as const,
              value: id,
            })),
          ),
        );
      }

      if (criteria.roles?.length) {
        parts.push(
          this.orGroup(
            criteria.roles.map((role) => ({
              field: 'tag' as const,
              key: 'role',
              relation: '=' as const,
              value: role,
            })),
          ),
        );
      }

      if (!parts.length) {
        // Segment with no recognised criteria → target whole tenant
        return [{ field: 'tag', key: 'tenant_id', relation: '=', value: tenantId }];
      }

      // AND between different criterion types: just concatenate (AND is default)
      return parts.flat();
    });

    // OR between segments
    if (perSegment.length === 1) return perSegment[0];
    return perSegment.reduce((acc, seg, i) => {
      if (i === 0) return seg;
      return [...acc, { operator: 'OR' as const }, ...seg];
    }, [] as OneSignalFilter[]);
  }

  /** Interleaves an OR operator between each filter in the array. */
  private orGroup(filters: OneSignalFilter[]): OneSignalFilter[] {
    return filters.reduce((acc, f, i) => {
      if (i === 0) return [f];
      return [...acc, { operator: 'OR' as const }, f];
    }, [] as OneSignalFilter[]);
  }

  private hasAdvancedSegment(segments: AudienceSegment[]): boolean {
    return segments.some((seg) => hasBehaviorCriteria((seg.criteria ?? {}) as SegmentCriteria));
  }

  /**
   * Resolve os `AudienceSegment` (OR entre eles) para `external_id` de
   * `UserAccount` — o mesmo valor que `OneSignal.login(payload.sub)` grava
   * como external id do device (`onesignal-client.ts`, MOB-07). É o único
   * jeito de alcançar critério de comportamento: `buildFilters` só sabe
   * montar filtro de **tag**, e não existe tag de "sem presença há N dias"
   * no device — o dado mora no Postgres, não no OneSignal.
   *
   * `prisma.system`, como o resto do arquivo: roda tanto a partir do
   * scheduler (`scheduler.service.ts`, sem contexto de tenant) quanto de
   * dentro de uma request — e aqui precisa varrer pessoas fora do RLS de
   * quem disparou o envio (o autor não é a plateia).
   */
  private async resolveExternalUserIds(
    segments: AudienceSegment[],
    tenantId: string,
    category?: NotificationCategory,
  ): Promise<string[]> {
    const perSegment = await Promise.all(
      segments.map((seg) =>
        this.resolveExternalUserIdsForSegment((seg.criteria ?? {}) as SegmentCriteria, tenantId),
      ),
    );
    let ids = [...new Set(perSegment.flat())];

    if (category && ids.length) {
      ids = await this.excludeOptedOut(ids, tenantId, category);
    }

    return ids;
  }

  private async resolveExternalUserIdsForSegment(
    criteria: SegmentCriteria,
    tenantId: string,
  ): Promise<string[]> {
    const where: Prisma.UserAccountWhereInput = {
      tenant_id: tenantId,
      is_active: true,
      person_id: { not: null },
    };

    if (criteria.congregation_ids?.length) {
      where.congregation_id = { in: criteria.congregation_ids };
    }
    if (criteria.roles?.length) {
      where.roleAssignments = { some: { role_code: { in: criteria.roles } } };
    }
    if (criteria.group_ids?.length) {
      where.person = { groupMemberships: { some: { small_group_id: { in: criteria.group_ids } } } };
    }

    const accounts = await this.prisma.system.userAccount.findMany({
      where,
      select: { id: true, person_id: true },
    });
    if (!accounts.length) return [];

    if (!hasBehaviorCriteria(criteria)) return accounts.map((a) => a.id);

    const personIds = accounts.map((a) => a.person_id as string);
    const eligible = new Set(await this.filterByBehaviorCriteria(personIds, tenantId, criteria));
    return accounts.filter((a) => eligible.has(a.person_id as string)).map((a) => a.id);
  }

  /**
   * Aplica `inactive_since`/`group_attendance_gap`/`high_engagement` sobre
   * um conjunto já filtrado de `person_id` (AND entre os três, quando mais
   * de um vier no mesmo segmento). Sinal de engajamento = `VisitRecord`
   * (visita), `AttendanceRecord` (presença em `GroupMeeting` de célula) e
   * `MaterialOpenRecord` (abertura de material de estudo, `PROD-10`) — os
   * três já existem no schema por outro motivo; nenhum é tracking novo.
   * `NotificationDispatch.reached`/`opened` fica de fora de propósito: é
   * agregado por disparo, não por pessoa, então não dá para responder "esta
   * pessoa abriu a notificação" — só "quantos abriram no total".
   */
  private async filterByBehaviorCriteria(
    personIds: string[],
    tenantId: string,
    criteria: SegmentCriteria,
  ): Promise<string[]> {
    let candidateIds = personIds;

    if (criteria.group_attendance_gap) {
      const since = daysAgo(criteria.group_attendance_gap.days);
      const recent = await this.prisma.system.attendanceRecord.findMany({
        where: { tenant_id: tenantId, person_id: { in: candidateIds }, checked_in_at: { gte: since } },
        select: { person_id: true },
        distinct: ['person_id'],
      });
      const recentIds = new Set(recent.map((r) => r.person_id));
      candidateIds = candidateIds.filter((id) => !recentIds.has(id));
    }

    if (candidateIds.length && criteria.inactive_since) {
      const since = daysAgo(criteria.inactive_since.days);
      const engagedIds = await this.engagementSince(candidateIds, tenantId, since);
      candidateIds = candidateIds.filter((id) => !engagedIds.has(id));
    }

    if (candidateIds.length && criteria.high_engagement) {
      const since = daysAgo(criteria.high_engagement.days);
      const counts = await this.engagementCountsSince(candidateIds, tenantId, since);
      const minEvents = criteria.high_engagement.min_events;
      candidateIds = candidateIds.filter((id) => (counts.get(id) ?? 0) >= minEvents);
    }

    return candidateIds;
  }

  /** person_id com pelo menos um sinal de engajamento (visita, presença ou abertura de material) desde `since`. */
  private async engagementSince(personIds: string[], tenantId: string, since: Date): Promise<Set<string>> {
    const [visits, attendances, opens] = await Promise.all([
      this.prisma.system.visitRecord.findMany({
        where: { tenant_id: tenantId, person_id: { in: personIds }, visited_at: { gte: since } },
        select: { person_id: true },
        distinct: ['person_id'],
      }),
      this.prisma.system.attendanceRecord.findMany({
        where: { tenant_id: tenantId, person_id: { in: personIds }, checked_in_at: { gte: since } },
        select: { person_id: true },
        distinct: ['person_id'],
      }),
      this.prisma.system.materialOpenRecord.findMany({
        where: { tenant_id: tenantId, person_id: { in: personIds }, opened_at: { gte: since } },
        select: { person_id: true },
        distinct: ['person_id'],
      }),
    ]);
    return new Set([...visits, ...attendances, ...opens].map((r) => r.person_id));
  }

  /** Contagem de sinais de engajamento (visita + presença + abertura de material) por person_id desde `since`. */
  private async engagementCountsSince(
    personIds: string[],
    tenantId: string,
    since: Date,
  ): Promise<Map<string, number>> {
    const [visits, attendances, opens] = await Promise.all([
      this.prisma.system.visitRecord.findMany({
        where: { tenant_id: tenantId, person_id: { in: personIds }, visited_at: { gte: since } },
        select: { person_id: true },
      }),
      this.prisma.system.attendanceRecord.findMany({
        where: { tenant_id: tenantId, person_id: { in: personIds }, checked_in_at: { gte: since } },
        select: { person_id: true },
      }),
      this.prisma.system.materialOpenRecord.findMany({
        where: { tenant_id: tenantId, person_id: { in: personIds }, opened_at: { gte: since } },
        select: { person_id: true },
      }),
    ]);

    const counts = new Map<string, number>();
    for (const row of [...visits, ...attendances, ...opens]) {
      counts.set(row.person_id, (counts.get(row.person_id) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Espelha, para o modo external_user_ids, o `pref_<categoria> != false`
   * que `buildFilters` aplica via tag — mesmo default (sem linha em
   * `NotificationPreference` = não desativou, `@default(true)` no schema).
   */
  private async excludeOptedOut(
    userAccountIds: string[],
    tenantId: string,
    category: NotificationCategory,
  ): Promise<string[]> {
    const optedOut = await this.prisma.system.notificationPreference.findMany({
      where: { tenant_id: tenantId, user_account_id: { in: userAccountIds }, [category]: false },
      select: { user_account_id: true },
    });
    const excluded = new Set(optedOut.map((p) => p.user_account_id));
    return userAccountIds.filter((id) => !excluded.has(id));
  }

  private async dispatch(opts: {
    tenantId: string;
    congregationId: string;
    contentPostId: string | null;
    title: string;
    body: string;
    filters?: OneSignalFilter[];
    externalUserIds?: string[];
    data: Record<string, string>;
  }): Promise<void> {
    const appId = process.env['ONESIGNAL_APP_ID'];
    const apiKey = process.env['ONESIGNAL_API_KEY'];

    if (!appId) {
      this.logger.warn('ONESIGNAL_APP_ID não configurado — criando dispatch sem envio');
      await this.createDispatch(opts.tenantId, opts.congregationId, opts.contentPostId, null, NotificationStatus.failed);
      return;
    }

    // Segmento avançado sem nenhum destinatário elegível — nada a enviar, e
    // não é falha do mecanismo de envio (mesmo princípio de "sem app id":
    // não chama o OneSignal à toa, só que aqui o resultado é sucesso vazio).
    if (opts.externalUserIds && opts.externalUserIds.length === 0) {
      this.logger.warn('Segmentação avançada sem destinatários elegíveis — dispatch sem envio');
      await this.createDispatch(opts.tenantId, opts.congregationId, opts.contentPostId, null, NotificationStatus.sent);
      return;
    }

    let onesignalId: string | null = null;
    let status: NotificationStatus = NotificationStatus.sent;

    try {
      const payload = opts.externalUserIds
        ? {
            app_id: appId,
            headings: { en: opts.title, pt: opts.title },
            contents: { en: opts.body, pt: opts.body },
            include_external_user_ids: opts.externalUserIds,
            channel_for_external_user_ids: 'push',
            data: opts.data,
          }
        : {
            app_id: appId,
            headings: { en: opts.title, pt: opts.title },
            contents: { en: opts.body, pt: opts.body },
            filters: opts.filters,
            data: opts.data,
          };

      this.logger.debug(
        `OneSignal payload: ${JSON.stringify({
          headings: payload.headings,
          filter_count: opts.filters?.length,
          external_user_id_count: opts.externalUserIds?.length,
        })}`,
      );

      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as { id?: string; errors?: unknown };

      if (!res.ok) {
        this.logger.warn(`OneSignal respondeu ${res.status}: ${JSON.stringify(json)}`);
        status = NotificationStatus.failed;
      } else {
        onesignalId = (json.id as string) ?? null;
        this.logger.log(`OneSignal notification sent id=${onesignalId}`);
      }
    } catch (err) {
      this.logger.error(`Falha ao chamar OneSignal: ${String(err)}`);
      status = NotificationStatus.failed;
    }

    await this.createDispatch(opts.tenantId, opts.congregationId, opts.contentPostId, onesignalId, status);
  }

  private async createDispatch(
    tenantId: string,
    congregationId: string,
    contentPostId: string | null,
    onesignalId: string | null,
    status: NotificationStatus,
  ): Promise<void> {
    // system client: dispatch creation happens in both scheduler and request contexts.
    // Explicit tenant_id/congregation_id means RLS is irrelevant for the write.
    await this.prisma.system.notificationDispatch.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        content_post_id: contentPostId,
        channel: NotificationChannel.push,
        status,
        onesignal_id: onesignalId,
        sent_at: new Date(),
      },
    });
  }
}
