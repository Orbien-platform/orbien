// Tela de encontros do grupo (MOB-09) — rota-filha do Stack raiz (fora de
// (tabs)), mesmo critério de post/[id].tsx e indisponibilidade.tsx. Lista
// os encontros do grupo, mais recente primeiro; toque num encontro leva ao
// material (`/grupo/encontro/[id]`).
//
// Visual conforme STYLE-GUIDE.md: o card mostrava `item.topic ??
// item.occurred_at` — sem tópico, o usuário via a data ISO crua
// ("2026-09-13T19:00:00.000Z"). Agora a data vem formatada em pt-BR
// (src/lib/format/date.ts) como bloco à esquerda do card (§7), e o tópico
// fica no título, com um rótulo neutro quando não há.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../components/AppButton";
import { Card } from "../../components/Card";
import { DateBlock } from "../../components/DateBlock";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { StatusMessage } from "../../components/StatusMessage";
import { listMeetings } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { GroupMeetingSummary } from "../../lib/pequenos-grupos/types";
import { formatDateTime } from "../../lib/format/date";
import { CalendarDays, ChevronRight, RefreshCw, WifiOff } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar os encontros. Verifique sua conexão.";
const EMPTY_MESSAGE = "Nenhum encontro registrado.";

export default function GrupoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
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
      <StatusMessage testID="grupo-error" icon={WifiOff} message={error} tone="danger">
        <AppButton
          testID="grupo-retry"
          title="Tentar novamente"
          icon={RefreshCw}
          variant="secondary"
          onPress={() => {
            setError(null);
            setRetryCount((n) => n + 1);
          }}
        />
      </StatusMessage>
    );
  }

  if (meetings && meetings.length === 0) {
    return (
      <StatusMessage
        testID="grupo-empty"
        icon={CalendarDays}
        message={EMPTY_MESSAGE}
        description="Os encontros do grupo aparecem aqui quando forem registrados."
      />
    );
  }

  return (
    <Screen>
      <FlatList
        testID="grupo-meetings-list"
        data={meetings ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          meetings && meetings.length > 0 ? (
            <SectionLabel trailing={String(meetings.length)}>Encontros</SectionLabel>
          ) : null
        }
        renderItem={({ item }) => {
          const when = formatDateTime(item.occurred_at);
          return (
            <Card
              testID={`encontro-${item.id}`}
              onPress={() => router.push(`/grupo/encontro/${item.id}`)}
              accessibilityLabel={item.topic ?? when ?? "Encontro"}
            >
              <View style={styles.cardRow}>
                <DateBlock iso={item.occurred_at} />
                <View style={styles.cardBody}>
                  <Text style={[typography.h3, { color: colors.textPrimary }]}>
                    {item.topic ?? "Encontro"}
                  </Text>
                  {when ? (
                    <Text style={[typography.caption, styles.when, { color: colors.textTertiary }]}>
                      {when}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight
                  size={iconSize.inline}
                  color={colors.textTertiary}
                  strokeWidth={ICON_STROKE_WIDTH}
                />
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardBody: { flex: 1 },
  when: { marginTop: spacing.xs },
});
