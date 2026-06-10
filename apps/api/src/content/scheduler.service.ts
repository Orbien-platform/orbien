import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/5 * * * *')
  async publishScheduledPosts(): Promise<void> {
    const now = new Date();

    // system client uses DIRECT_URL (postgres/BYPASSRLS) so RLS doesn't filter
    // cross-tenant results. Schedulers must never run as orbien_app without context.
    const due = await this.prisma.system.contentPost.findMany({
      where: { is_draft: false, published_at: null, publish_at: { lte: now } },
      include: { postSegments: { include: { segment: true } } },
    });

    if (!due.length) return;

    // Optimistic lock: WHERE published_at IS NULL prevents double-publish
    // if two scheduler instances run concurrently.
    const { count } = await this.prisma.system.contentPost.updateMany({
      where: { id: { in: due.map((p) => p.id) }, published_at: null },
      data: { published_at: now },
    });

    for (const post of due) {
      this.logger.log(`Published scheduled post ${post.id}`);
      const segments = post.postSegments.map((ps) => ps.segment);
      // fire-and-forget: notification failure must not block the scheduler loop
      this.notifications
        .notifyPost({ ...post, published_at: now }, segments)
        .catch((err: unknown) => {
          this.logger.error(`Failed to notify post ${post.id}: ${String(err)}`);
        });
    }
    this.logger.log(`Published ${count} scheduled posts`);
  }
}
