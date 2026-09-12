import { ContentPostType } from '@prisma/client';

/**
 * Grupos amplos de preferência de notificação (MOB-10), únicos entre a tela
 * de preferências (`NotificationPreferencesService`) e o filtro de disparo
 * (`NotificationsService.notifyPost`) — as duas leem daqui, nunca duplicam o
 * mapeamento.
 *
 * Ver `.specs/features/preferencias-notificacao-mobile/spec.md` (Assumptions)
 * para a decisão dos 4 grupos e o motivo (usuário quis oração separada de
 * avisos).
 */
export const NOTIFICATION_CATEGORIES = ['avisos', 'oracao', 'eventos', 'devocional'] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * `Record<ContentPostType, NotificationCategory>` obriga, em tempo de build,
 * todo valor de `ContentPostType` a estar mapeado — um valor novo no enum
 * sem entrada aqui já quebra `npm run build:api` antes de chegar a produção
 * (spec.md, Assumptions: "não deve acontecer"). O teste unitário
 * (`notification-categories.spec.ts`) trava o mesmo invariante em runtime,
 * lendo os valores reais do enum do Prisma Client.
 */
export const CATEGORY_BY_POST_TYPE: Record<ContentPostType, NotificationCategory> = {
  post: 'avisos',
  notice: 'avisos',
  prayer: 'oracao',
  event: 'eventos',
  devotional: 'devocional',
  study: 'devocional',
  sermon_video: 'devocional',
  audio: 'devocional',
};
