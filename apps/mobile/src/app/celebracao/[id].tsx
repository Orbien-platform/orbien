// Tela de detalhe da OC + setlist (MOB-08) — rota-filha do Stack raiz (fora
// de (tabs)), mesmo critério de post/[id].tsx e indisponibilidade.tsx: tela
// de detalhe empurrada por router.push, não uma seção própria de
// navegação. Destino do toque num item da aba Celebrações.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Text, View } from "react-native";

import { HttpError } from "../../lib/api/errors";
import { getServiceOrder } from "../../lib/celebracoes/celebracoes-client";
import type { ServiceOrder } from "../../lib/celebracoes/types";

const NOT_FOUND_MESSAGE = "Ordem de culto não encontrada.";
const LOAD_ERROR_MESSAGE = "Não foi possível carregar a Ordem de Culto. Verifique sua conexão.";
const UNPUBLISHED_WARNING = "Ordem de culto ainda não publicada — pode mudar.";
const NO_SETLIST_MESSAGE = "Repertório ainda não publicado";

export default function CelebracaoScreen() {
  const { id, ministryId } = useLocalSearchParams<{ id: string; ministryId?: string }>();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getServiceOrder(id)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof HttpError && err.status === 404 ? NOT_FOUND_MESSAGE : LOAD_ERROR_MESSAGE,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id, retryCount]);

  if (error) {
    const canRetry = error === LOAD_ERROR_MESSAGE;
    return (
      <View testID="celebracao-error" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>{error}</Text>
        {canRetry ? (
          <Button
            testID="celebracao-retry"
            title="Tentar novamente"
            onPress={() => {
              setError(null);
              setRetryCount((n) => n + 1);
            }}
          />
        ) : null}
      </View>
    );
  }

  if (!order) {
    return (
      <View testID="celebracao-loading" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Carregando…</Text>
      </View>
    );
  }

  const items = [...order.items].sort((a, b) => a.sequence - b.sequence);

  return (
    <View testID="celebracao-detail" style={{ flex: 1 }}>
      <Text testID="celebracao-title">{order.title}</Text>
      {order.published_at === null ? (
        <Text testID="celebracao-unpublished-warning">{UNPUBLISHED_WARNING}</Text>
      ) : null}
      {items.map((item) => {
        const isMine = ministryId !== undefined && item.ministry?.id === ministryId;
        return (
          <View
            key={item.id}
            testID={isMine ? `celebracao-item-${item.id}-mine` : `celebracao-item-${item.id}`}
          >
            <Text>{item.name}</Text>
            <Text>
              {item.responsible_type === "person" && item.person
                ? item.person.full_name
                : item.responsible_type === "ministry" && item.ministry
                  ? item.ministry.name
                  : item.responsible_label}
            </Text>
            {item.setlist ? (
              item.setlist.songs.map((song) => <Text key={song.id}>{song.title}</Text>)
            ) : (
              <Text>{NO_SETLIST_MESSAGE}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
