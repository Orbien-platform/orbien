// Tela de encontros do grupo (MOB-09) — rota-filha do Stack raiz (fora de
// (tabs)), mesmo critério de post/[id].tsx e indisponibilidade.tsx. Lista
// os encontros do grupo, mais recente primeiro; toque num encontro leva ao
// material (`/grupo/encontro/[id]`).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Text } from "react-native";

import { AppLink } from "../../components/AppLink";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { listMeetings } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { GroupMeetingSummary } from "../../lib/pequenos-grupos/types";
import { typography } from "../../lib/theme/tokens";

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
      <StatusMessage testID="grupo-error" message={error} tone="danger">
        <AppLink
          testID="grupo-retry"
          onPress={() => {
            setError(null);
            setRetryCount((n) => n + 1);
          }}
        >
          Tentar novamente
        </AppLink>
      </StatusMessage>
    );
  }

  if (meetings && meetings.length === 0) {
    return <StatusMessage testID="grupo-empty" message={EMPTY_MESSAGE} />;
  }

  return (
    <Screen>
      <FlatList
        testID="grupo-meetings-list"
        data={meetings ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card testID={`encontro-${item.id}`} onPress={() => router.push(`/grupo/encontro/${item.id}`)}>
            <Text style={typography.body}>{item.topic ?? item.occurred_at}</Text>
          </Card>
        )}
      />
    </Screen>
  );
}
