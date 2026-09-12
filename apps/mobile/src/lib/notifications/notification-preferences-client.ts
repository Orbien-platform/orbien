// NotificationPreferencesClient (MOB-10a) — wrapper tipado sobre
// `authenticatedRequest` para `GET/PATCH /me/notification-preferences`.
// Mesmo princípio de separação `*-client.ts` (lógica) vs. tela (UI) de
// `content-client.ts`/`escala-client.ts`.
import { authenticatedRequest } from "../auth/auth-client";

/** Mesmas 4 categorias de `apps/api/src/content/notification-categories.ts`
 * (MOB-10, Assumptions) — sem import cruzado entre apps (CLAUDE.md), o
 * shape é replicado aqui como o contrato HTTP já obriga. */
export interface NotificationPreferenceValues {
  avisos: boolean;
  oracao: boolean;
  eventos: boolean;
  devocional: boolean;
}

/** `GET /me/notification-preferences` — sem preferência salva, o servidor
 * devolve as 4 categorias ligadas (default opt-out, ver spec.md). */
export async function getNotificationPreferences(): Promise<NotificationPreferenceValues> {
  return authenticatedRequest<NotificationPreferenceValues>("get", "/me/notification-preferences");
}

/** `PATCH /me/notification-preferences` — patch parcial (só a categoria
 * tocada), devolve o estado completo resultante. */
export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferenceValues>,
): Promise<NotificationPreferenceValues> {
  return authenticatedRequest<NotificationPreferenceValues>("patch", "/me/notification-preferences", {
    body: patch,
  });
}
