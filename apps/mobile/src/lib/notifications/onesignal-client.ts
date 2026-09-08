// onesignal-client (MOB-07) — único ponto do app que importa o SDK
// `react-native-onesignal` (mesmo princípio de auth-client.ts centralizar
// expo-secure-store). Ver design.md, Rodada 4, Components.
import Constants from "expo-constants";
import { OneSignal } from "react-native-onesignal";

import { decodeJwtPayload } from "../auth/jwt";

function getAppId(): string {
  const appId = Constants.expoConfig?.extra?.oneSignalAppId;
  if (typeof appId !== "string" || appId.length === 0) {
    throw new Error(
      "oneSignalAppId não configurado em Constants.expoConfig.extra — verifique app.config.js/eas.json",
    );
  }
  return appId;
}

/** Chamado uma vez, no mount do NotificationsProvider. */
export function initializeOneSignal(): void {
  OneSignal.initialize(getAppId());
  OneSignal.Notifications.requestPermission(true);
}

/**
 * AC1 (MOB-07): `external_id` = id do usuário autenticado (`sub` do JWT).
 * Tags espelham os mesmos valores que `notifications.service.ts` já usa
 * para montar os filtros de segmento no backend (`buildFilters`) —
 * `tenant_id`, `congregation_id`, `role` (só o primeiro papel do usuário:
 * o formato de tag do backend não representa múltiplos papéis, ver
 * design.md Rodada 4, Pesquisa). Token indecodificável: no-op — um efeito
 * colateral de push não pode derrubar o app.
 */
export function registerDevice(accessToken: string): void {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return;

  OneSignal.login(payload.sub);
  OneSignal.User.addTags({
    tenant_id: payload.tenant_id,
    congregation_id: payload.congregation_id,
    role: payload.roles[0] ?? "",
  });
}

/**
 * Volta o dispositivo a anônimo (sem `external_id`, sem as tags da pessoa
 * anterior) — essencial em device compartilhado: sem isso, a próxima
 * pessoa a logar no mesmo aparelho receberia push endereçada à conta
 * anterior até o próximo `registerDevice` sobrescrever.
 */
export function unregisterDevice(): void {
  OneSignal.logout();
}

interface NotificationClickAdditionalData {
  post_id?: string;
}

/**
 * AC4 (MOB-07): extrai `post_id` do mesmo `data` que
 * `NotificationsService.notifyPost` já envia
 * (`apps/api/src/content/notifications.service.ts:48`) e chama `handler`
 * só quando o campo existe. Devolve função de remoção do listener (mesmo
 * padrão de `onSessionExpired`, `auth-client.ts`).
 */
export function onNotificationClick(handler: (postId: string) => void): () => void {
  const listener = (event: { notification: { additionalData?: object } }) => {
    const data = event.notification.additionalData as NotificationClickAdditionalData | undefined;
    if (data?.post_id) handler(data.post_id);
  };

  OneSignal.Notifications.addEventListener("click", listener);
  return () => {
    OneSignal.Notifications.removeEventListener("click", listener);
  };
}
