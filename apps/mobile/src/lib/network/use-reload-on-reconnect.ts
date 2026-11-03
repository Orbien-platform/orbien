// Recuperação automática do estado "sem conexão" (PROD-32, Órbita v2): a
// tela que falhou por falta de rede relê sozinha quando a conexão volta,
// além do "Tentar novamente" que já existe.
//
// Regras que o hook garante, para a tela não ter de repeti-las:
//  - só observa a rede enquanto `enabled` — ou seja, só com a tela no erro
//    offline (`describeLoadError(...).offline`). Tela que carregou, ou que
//    falhou por erro do servidor, não assina nada;
//  - só recarrega na VOLTA da conexão: precisa ter visto o aparelho offline
//    depois de assinar. "Já estava online" não dispara, senão um erro de
//    servidor mal classificado viraria laço de releitura;
//  - uma releitura por retorno, com espera (`SETTLE_MS`) para a rede
//    oscilar sem tempestade: se cair de novo antes do prazo, o disparo é
//    cancelado e o próximo retorno recomeça a conta;
//  - `reload` é a MESMA função do botão "Tentar novamente", que só refaz a
//    leitura. O hook nunca reenvia escrita (nem POST).
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";

/** Espera depois do retorno da conexão antes de reler. */
export const SETTLE_MS = 800;

/** `isInternetReachable` é `null` enquanto o NetInfo ainda não sabe: nesse
 * caso vale o `isConnected`, para não segurar a releitura à toa. */
export function isOnline(state: Pick<NetInfoState, "isConnected" | "isInternetReachable">): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function useReloadOnReconnect(enabled: boolean, reload: () => void): void {
  // A tela costuma passar uma closure nova a cada render; guardar a última
  // evita reassinar o NetInfo por isso.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });

  useEffect(() => {
    if (!enabled) return;

    let sawOffline = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!isOnline(state)) {
        sawOffline = true;
        clear();
        return;
      }
      if (!sawOffline || timer) return;
      sawOffline = false;
      timer = setTimeout(() => {
        timer = null;
        reloadRef.current();
      }, SETTLE_MS);
    });

    return () => {
      clear();
      unsubscribe();
    };
  }, [enabled]);
}
