// NotificationsProvider (MOB-07) — fecha o ciclo de vida do registro no
// OneSignal: inicializa o SDK uma vez, registra/de-registra o dispositivo
// reagindo à sessão (mesma forma do useEffect([session]) de
// theme-provider.tsx) e liga o listener de clique à navegação. Sem
// contexto próprio — nenhuma tela precisa ler estado de push, é só efeito
// colateral (design.md, Rodada 4, Components).
import { useRouter } from "expo-router";
import React, { useEffect } from "react";

import { useAuth } from "../auth/auth-provider";
import {
  initializeOneSignal,
  onNotificationClick,
  registerDevice,
  unregisterDevice,
} from "./onesignal-client";

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    initializeOneSignal();
    return onNotificationClick((postId) => {
      router.push(`/post/${postId}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init + listener uma vez só, mesmo princípio de onSessionExpired (auth-provider.tsx)
  }, []);

  // Cleanup (não o ramo "else") é o que garante o de-registro: o AuthGate
  // (_layout.tsx) desmonta este provider assim que `status` vira
  // "unauthenticated" (troca `children` por `<Redirect>`) — nesse ponto o
  // `session` já é `null` no momento em que o componente some, então um
  // efeito que só rodasse de novo com `session === null` nunca chegaria a
  // rodar. A cleanup function roda tanto nesse desmonte quanto numa futura
  // troca de sessão com o provider ainda montado (login→login direto).
  useEffect(() => {
    if (!session) return;
    registerDevice(session.accessToken);
    return () => unregisterDevice();
  }, [session]);

  return <>{children}</>;
}
