// Tela Grupos (MOB-09) — lista os grupos do usuário (líder ou membro), via
// listMyGroups (GET /small-groups/mine). Toque num grupo leva à lista de
// encontros (`/grupo/[id]`).
//
// Visual conforme STYLE-GUIDE.md: o card era uma única linha de texto
// concatenada ("Nome — Papel — 19:30"). Agora é o card de lista do §7 —
// avatar com as iniciais do grupo, nome em `h3`, horário como meta com
// ícone e o papel em badge —, o que também torna o papel legível de
// relance em vez de escondido no meio da frase.
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../components/AppButton";
import { Avatar } from "../../components/Avatar";
import { Badge, type BadgeTone } from "../../components/Badge";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { StatusMessage } from "../../components/StatusMessage";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { listMyGroups } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { SmallGroupMine } from "../../lib/pequenos-grupos/types";
import { ChevronRight, CircleAlert, Clock, RefreshCw, Users, WifiOff } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

const EMPTY_MESSAGE = "Você não participa de nenhum grupo.";

const ROLE_LABELS: Record<SmallGroupMine["role"], string> = {
  leader: "Líder",
  trainee: "Em treinamento",
  member: "Membro",
};

// Líder em `info` (navy) destaca a responsabilidade sem usar a cor de
// sucesso, que o §6 reserva para estado positivo.
const ROLE_TONES: Record<SmallGroupMine["role"], BadgeTone> = {
  leader: "info",
  trainee: "neutral",
  member: "neutral",
};

export default function GruposScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [groups, setGroups] = useState<SmallGroupMine[] | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listMyGroups()
      .then((result) => {
        if (cancelled) return;
        setGroups(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeLoadError(err, "seus grupos"));
      });

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  if (error) {
    return (
      <StatusMessage
        testID="grupos-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton
          testID="grupos-retry"
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

  if (groups && groups.length === 0) {
    return (
      <StatusMessage
        testID="grupos-empty"
        icon={Users}
        message={EMPTY_MESSAGE}
        description="Quando você entrar num pequeno grupo, ele aparece aqui."
      />
    );
  }

  return (
    <Screen>
      <FlatList
        testID="grupos-list"
        data={groups ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          groups && groups.length > 0 ? (
            <SectionLabel trailing={String(groups.length)}>Meus grupos</SectionLabel>
          ) : null
        }
        renderItem={({ item }) => (
          <Card
            testID={`grupo-${item.id}`}
            onPress={() => router.push(`/grupo/${item.id}`)}
            accessibilityLabel={`${item.name} — ${ROLE_LABELS[item.role]}`}
          >
            <View style={styles.cardRow}>
              <Avatar name={item.name} />
              <View style={styles.cardBody}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>{item.name}</Text>
                {item.meeting_time ? (
                  <View style={styles.metaRow}>
                    <Clock
                      size={iconSize.inline}
                      color={colors.textTertiary}
                      strokeWidth={ICON_STROKE_WIDTH}
                    />
                    <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
                      {item.meeting_time}
                    </Text>
                  </View>
                ) : null}
                <Badge
                  testID={`grupo-${item.id}-papel`}
                  label={ROLE_LABELS[item.role]}
                  tone={ROLE_TONES[item.role]}
                  style={styles.badge}
                />
              </View>
              <ChevronRight
                size={iconSize.inline}
                color={colors.textTertiary}
                strokeWidth={ICON_STROKE_WIDTH}
              />
            </View>
          </Card>
        )}
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  badge: { marginTop: spacing.sm },
});
