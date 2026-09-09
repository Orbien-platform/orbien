// Tela Celebrações (MOB-08) — lista as celebrações do usuário (member/
// volunteer, via getMyAssignments — mesma fonte da aba Escala) ou da
// congregação (ministry_leader+, via listUpcomingInstances), decidindo a
// fonte por `roles` do token (design.md, Tech Decisions). Toca num item com
// OC leva ao detalhe (`/celebracao/[id]`), passando o ministério da própria
// escala quando a origem for assignment (destaque de "minha função" na
// tela de detalhe, MOB-08-03).
//
// Visual conforme STYLE-GUIDE.md: o card inteiro navega quando há Ordem de
// Culto (§7 — "nunca exigir toque em área específica dentro do card"), e o
// chevron à direita é a marca visível disso. O "Ver Ordem de Culto" era um
// link de ~20px de alvo dentro de um card inerte.
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Pressable, Text, View } from "react-native";

import { Card } from "../../components/Card";
import { DateBlock } from "../../components/DateBlock";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { StatusMessage } from "../../components/StatusMessage";
import { decodeJwtPayload } from "../../lib/auth/jwt";
import { useAuth } from "../../lib/auth/auth-provider";
import { getMyAssignments } from "../../lib/escala/escala-client";
import { listUpcomingInstances } from "../../lib/celebracoes/celebracoes-client";
import { formatDateTime } from "../../lib/format/date";
import { ChevronRight, Church, ListMusic, WifiOff } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import {
  ICON_STROKE_WIDTH,
  iconSize,
  spacing,
  touchTarget,
  typography,
} from "../../lib/theme/tokens";

const LEADER_ROLES = [
  "ministry_leader",
  "admin_congregation",
  "pastor",
  "tenant_admin",
  "secretary",
];

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar as celebrações. Verifique sua conexão.";
const EMPTY_VOLUNTEER_MESSAGE = "Você não tem celebrações próximas.";
const EMPTY_LEADER_MESSAGE = "Nenhuma celebração agendada.";

interface CelebracaoListItem {
  id: string;
  celebrationName: string;
  scheduledDate: string;
  serviceOrderId: string | null;
  ministryId?: string;
}

function fromAssignments(
  assignments: Awaited<ReturnType<typeof getMyAssignments>>,
): CelebracaoListItem[] {
  return assignments.map((a) => ({
    id: a.id,
    celebrationName: a.celebration.name,
    scheduledDate: a.scheduled_date,
    serviceOrderId: a.service_order_id,
    ministryId: a.ministry.id,
  }));
}

function fromInstances(
  instances: Awaited<ReturnType<typeof listUpcomingInstances>>,
): CelebracaoListItem[] {
  return instances.map((i) => ({
    id: i.id,
    celebrationName: i.celebration.name,
    scheduledDate: i.scheduled_date,
    serviceOrderId: i.serviceOrder?.id ?? null,
  }));
}

export default function CelebracoesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useTheme();
  const roles = session ? decodeJwtPayload(session.accessToken)?.roles ?? [] : [];
  const isLeader = roles.some((r) => LEADER_ROLES.includes(r));

  const [items, setItems] = useState<CelebracaoListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchItems = isLeader
      ? listUpcomingInstances().then(fromInstances)
      : getMyAssignments().then(fromAssignments);

    fetchItems
      .then((result) => {
        if (cancelled) return;
        setItems(result);
      })
      .catch(() => {
        if (cancelled) return;
        setError(NETWORK_ERROR_MESSAGE);
      });

    return () => {
      cancelled = true;
    };
  }, [isLeader]);

  if (error) {
    return (
      <StatusMessage
        testID="celebracoes-error"
        icon={WifiOff}
        message={error}
        description="Assim que a conexão voltar, abra a aba novamente."
        tone="danger"
      />
    );
  }

  if (items && items.length === 0) {
    return (
      <StatusMessage
        testID="celebracoes-empty"
        icon={Church}
        message={isLeader ? EMPTY_LEADER_MESSAGE : EMPTY_VOLUNTEER_MESSAGE}
        description="As celebrações programadas aparecem aqui."
      />
    );
  }

  return (
    <Screen>
      <FlatList
        testID="celebracoes-list"
        data={items ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          items && items.length > 0 ? (
            <SectionLabel trailing={String(items.length)}>Celebrações</SectionLabel>
          ) : null
        }
        renderItem={({ item }) => {
          const when = formatDateTime(item.scheduledDate);
          const openServiceOrder = item.serviceOrderId
            ? () =>
                router.push(
                  item.ministryId
                    ? `/celebracao/${item.serviceOrderId}?ministryId=${item.ministryId}`
                    : `/celebracao/${item.serviceOrderId}`,
                )
            : undefined;

          return (
            <Card
              testID={`celebracao-${item.id}`}
              onPress={openServiceOrder}
              accessibilityLabel={
                openServiceOrder
                  ? `${item.celebrationName} — abrir Ordem de Culto`
                  : item.celebrationName
              }
            >
              <View style={styles.cardRow}>
                <DateBlock iso={item.scheduledDate} />
                <View style={styles.cardBody}>
                  <Text style={[typography.h3, { color: colors.textPrimary }]}>
                    {item.celebrationName}
                  </Text>
                  {when ? (
                    <Text style={[typography.caption, styles.when, { color: colors.textTertiary }]}>
                      {when}
                    </Text>
                  ) : null}
                  {item.serviceOrderId ? (
                    <View style={styles.metaRow}>
                      <ListMusic
                        size={iconSize.inline}
                        color={colors.textSecondary}
                        strokeWidth={ICON_STROKE_WIDTH}
                      />
                      <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
                        Ordem de Culto disponível
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[typography.bodyMedium, styles.when, { color: colors.textTertiary }]}
                    >
                      Ordem de Culto ainda não publicada
                    </Text>
                  )}
                </View>
                {/* O chevron é o alvo explícito que os testes desta tela
                    pressionam; o card inteiro leva ao mesmo destino. */}
                {openServiceOrder ? (
                  <Pressable
                    testID={`celebracao-abrir-${item.id}`}
                    onPress={openServiceOrder}
                    accessibilityRole="button"
                    accessibilityLabel="Ver Ordem de Culto"
                    hitSlop={spacing.sm}
                    style={styles.chevron}
                  >
                    <ChevronRight
                      size={iconSize.action}
                      color={colors.textTertiary}
                      strokeWidth={ICON_STROKE_WIDTH}
                    />
                  </Pressable>
                ) : null}
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
    alignItems: "flex-start",
    gap: spacing.md,
  },
  cardBody: { flex: 1 },
  when: { marginTop: spacing.xs },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  chevron: {
    // Ícone de 24px num alvo de 48 (§3): o padding invisível completa o
    // toque sem inflar o desenho.
    minWidth: touchTarget / 2,
    minHeight: touchTarget / 2,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
