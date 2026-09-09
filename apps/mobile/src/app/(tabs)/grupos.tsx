// Tela Grupos (MOB-09) — lista os grupos do usuário (líder ou membro), via
// listMyGroups (GET /small-groups/mine). Toque num grupo leva à lista de
// encontros (`/grupo/[id]`).
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";

import { listMyGroups } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { SmallGroupMine } from "../../lib/pequenos-grupos/types";

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
      <View testID="grupos-error" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>{error}</Text>
        <Text
          testID="grupos-retry"
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

  if (groups && groups.length === 0) {
    return (
      <View testID="grupos-empty" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>{EMPTY_MESSAGE}</Text>
      </View>
    );
  }

  return (
    <FlatList
      testID="grupos-list"
      data={groups ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Text
          testID={`grupo-${item.id}`}
          onPress={() => router.push(`/grupo/${item.id}`)}
        >
          {`${item.name} — ${ROLE_LABELS[item.role]}${item.meeting_time ? ` — ${item.meeting_time}` : ""}`}
        </Text>
      )}
    />
  );
}
