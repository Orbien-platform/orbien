import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AudienceSegment, ContentPost, NotificationChannel, NotificationDispatch, NotificationStatus } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SendNotificationDto } from './dto/send-notification.dto';

interface SegmentCriteria {
  congregation_ids?: string[];
  group_ids?: string[];
  roles?: string[];
  // age_range and ministry_ids intentionally omitted — no OneSignal tag for these
}

type OneSignalFilter =
  | { field: 'tag'; key: string; relation: '='; value: string }
  | { operator: 'OR' };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notifyPost(
    post: ContentPost & { tenant_id: string; congregation_id: string },
    segments: AudienceSegment[],
  ): Promise<void> {
    const filters = this.buildFilters(segments, post.tenant_id);
    const body = post.body ? post.body.slice(0, 200) : post.title;

    await this.dispatch({
      tenantId: post.tenant_id,
      congregationId: post.congregation_id,
      contentPostId: post.id,
      title: post.title,
      body,
      filters,
      data: { post_id: post.id, type: post.type as string },
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

    const filters = this.buildFilters(segments, tenantId);

    await this.dispatch({
      tenantId,
      congregationId,
      contentPostId: null,
      title: dto.title,
      body: dto.body.slice(0, 200),
      filters,
      data: {},
    });
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

  private async dispatch(opts: {
    tenantId: string;
    congregationId: string;
    contentPostId: string | null;
    title: string;
    body: string;
    filters: OneSignalFilter[];
    data: Record<string, string>;
  }): Promise<void> {
    const appId = process.env['ONESIGNAL_APP_ID'];
    const apiKey = process.env['ONESIGNAL_API_KEY'];

    if (!appId) {
      this.logger.warn('ONESIGNAL_APP_ID não configurado — criando dispatch sem envio');
      await this.createDispatch(opts.tenantId, opts.congregationId, opts.contentPostId, null, NotificationStatus.failed);
      return;
    }

    let onesignalId: string | null = null;
    let status: NotificationStatus = NotificationStatus.sent;

    try {
      const payload = {
        app_id: appId,
        headings: { en: opts.title, pt: opts.title },
        contents: { en: opts.body, pt: opts.body },
        filters: opts.filters,
        data: opts.data,
      };

      this.logger.debug(`OneSignal payload: ${JSON.stringify({ headings: payload.headings, filter_count: payload.filters.length })}`);

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
