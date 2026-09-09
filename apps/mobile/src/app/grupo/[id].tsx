// Tela de encontros do grupo (MOB-09) — rota-filha do Stack raiz (fora de
// (tabs)), mesmo critério de post/[id].tsx e indisponibilidade.tsx. Lista
// os encontros do grupo, mais recente primeiro; toque num encontro leva ao
// material (`/grupo/encontro/[id]`).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";

import { listMeetings } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { GroupMeetingSummary } from "../../lib/pequenos-grupos/types";

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar os encontros. Verifique sua conexão.";
const EMPTY_MESSAGE = "Nenhum encontro registrado.";

export default function GrupoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [meetings, setMeetings] = useState<GroupMeetingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listMeetings(id)
      .then((result) => {
        if (cancelled) return;
        const sorted = [...result].sort(
          (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        );
        setMeetings(sorted);
      })
      .catch(() => {
        if (cancelled) return;
        setError(NETWORK_ERROR_MESSAGE);
      });

    return () => {
      cancelled = true;
    };
  }, [id, retryCount]);

  if (error) {
    return (
      <View testID="grupo-error" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>{error}</Text>
        <Text
          testID="grupo-retry"
          onPress={() => {
            setError(null);
            setRetryCount((n) => n + 1);
          }}
        >
          Tentar novamente
        </Text>
      </View>
    );
  }

  if (meetings && meetings.length === 0) {
    return (
      <View testID="grupo-empty" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>{EMPTY_MESSAGE}</Text>
      </View>
    );
  }

  return (
    <FlatList
      testID="grupo-meetings-list"
      data={meetings ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Text
          testID={`encontro-${item.id}`}
          onPress={() => router.push(`/grupo/encontro/${item.id}`)}
        >
          {item.topic ?? item.occurred_at}
        </Text>
      )}
    />
  );
}
