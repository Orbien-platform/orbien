import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationCategory, NOTIFICATION_CATEGORIES } from './notification-categories';

export type NotificationPreferenceValues = Record<NotificationCategory, boolean>;

const ALL_ON: NotificationPreferenceValues = {
  avisos: true,
  oracao: true,
  eventos: true,
  devocional: true,
};

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<NotificationPreferenceValues> {
    const row = await this.prisma.client.notificationPreference.findUnique({
      where: { user_account_id: userId },
    });

    if (!row) return { ...ALL_ON };

    return Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((category) => [category, row[category]]),
    ) as NotificationPreferenceValues;
  }

  async update(
    userId: string,
    tenantId: string,
    congregationId: string,
    patch: Partial<NotificationPreferenceValues>,
  ): Promise<NotificationPreferenceValues> {
    const row = await this.prisma.client.notificationPreference.upsert({
      where: { user_account_id: userId },
      create: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        user_account_id: userId,
        ...ALL_ON,
        ...patch,
      },
      update: { ...patch },
    });

    return Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((category) => [category, row[category]]),
    ) as NotificationPreferenceValues;
  }
}
