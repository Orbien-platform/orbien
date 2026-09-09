// Tela Grupos (MOB-09) — lista os grupos do usuário (líder ou membro), via
// listMyGroups (GET /small-groups/mine). Toque num grupo leva à lista de
// encontros (`/grupo/[id]`).
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Text } from "react-native";

import { AppLink } from "../../components/AppLink";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { listMyGroups } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { SmallGroupMine } from "../../lib/pequenos-grupos/types";
import { typography } from "../../lib/theme/tokens";

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar seus grupos. Verifique sua conexão.";
const EMPTY_MESSAGE = "Você não participa de nenhum grupo.";

const ROLE_LABELS: Record<SmallGroupMine["role"], string> = {
  leader: "Líder",
  trainee: "Em treinamento",
  member: "Membro",
};

export default function GruposScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<SmallGroupMine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listMyGroups()
      .then((result) => {
        if (cancelled) return;
        setGroups(result);
      })
      .catch(() => {
        if (cancelled) return;
        setError(NETWORK_ERROR_MESSAGE);
      });

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  if (error) {
    return (
      <StatusMessage testID="grupos-error" message={error} tone="danger">
        <AppLink
          testID="grupos-retry"
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

  if (groups && groups.length === 0) {
    return <StatusMessage testID="grupos-empty" message={EMPTY_MESSAGE} />;
  }

  return (
    <Screen>
      <FlatList
        testID="grupos-list"
        data={groups ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card testID={`grupo-${item.id}`} onPress={() => router.push(`/grupo/${item.id}`)}>
            <Text style={typography.body}>
              {`${item.name} — ${ROLE_LABELS[item.role]}${item.meeting_time ? ` — ${item.meeting_time}` : ""}`}
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}
