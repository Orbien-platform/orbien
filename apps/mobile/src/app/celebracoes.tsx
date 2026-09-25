// Tela Celebrações (MOB-08) — a agenda dos próximos cultos e eventos da
// congregação, para todo membro. O que muda por papel é o quanto cada card
// abre, não se a celebração aparece:
//
//   - quem está escalado vê o card marcado com o ministério e chega à Ordem
//     de Culto (com o destaque de "minha função", MOB-08-03);
//   - ministry_leader+ chega à OC de qualquer culto, como antes;
//   - os demais veem só que há culto, e quando.
//
// A agenda vem de `listAgenda` (ou de `listUpcomingInstances` para líder,
// que traz a OC) e a marca de escala de `getMyAssignments`. Antes o membro
// via só as próprias escalas — quem não servia em nada tinha a tela vazia.
//
// Visual conforme STYLE-GUIDE.md: o card inteiro navega quando há Ordem de
// Culto (§7 — "nunca exigir toque em área específica dentro do card"), e o
// chevron à direita é a marca visível disso.
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Pressable, Text, View } from "react-native";

import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { DateBlock } from "../components/DateBlock";
import { Screen } from "../components/Screen";
import { SectionLabel } from "../components/SectionLabel";
import { StatusMessage } from "../components/StatusMessage";
import { decodeJwtPayload } from "../lib/auth/jwt";
import { useAuth } from "../lib/auth/auth-provider";
import { getMyAssignments } from "../lib/escala/escala-client";
import type { Assignment } from "../lib/escala/types";
import { listAgenda, listUpcomingInstances } from "../lib/celebracoes/celebracoes-client";
import { describeLoadError, type LoadErrorState } from "../lib/api/load-error";
import { formatDateTime, localWhen } from "../lib/format/date";
import { ChevronRight, Church, CircleAlert, ListMusic, WifiOff } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import {
  ICON_STROKE_WIDTH,
  iconSize,
  spacing,
  touchTarget,
  typography,
} from "../lib/theme/tokens";

const LEADER_ROLES = [
  "ministry_leader",
  "admin_congregation",
  "pastor",
  "tenant_admin",
  "secretary",
];

const EMPTY_MESSAGE = "Nenhuma celebração agendada.";

interface CelebracaoListItem {
  id: string;
  celebrationName: string;
  /** Data e hora locais do culto, prontas para `DateBlock`/`formatDateTime`. */
  when: string;
  serviceOrderId: string | null;
  /** Ministério em que o usuário está escalado neste culto, se estiver. */
  ministry?: { id: string; name: string };
}

interface AgendaEntry {
  id: string;
  scheduled_date: string;
  celebration: { id: string; name: string; start_time?: string };
  serviceOrder?: { id: string } | null;
}

const dayKey = (celebrationId: string, scheduledDate: string) =>
  `${celebrationId}:${scheduledDate.slice(0, 10)}`;

function mergeAgenda(agenda: AgendaEntry[], assignments: Assignment[]): CelebracaoListItem[] {
  const mine = new Map(assignments.map((a) => [dayKey(a.celebration.id, a.scheduled_date), a]));

  const items: CelebracaoListItem[] = agenda.map((entry) => {
    const key = dayKey(entry.celebration.id, entry.scheduled_date);
    const assignment = mine.get(key);
    mine.delete(key);
    return {
      id: entry.id,
      celebrationName: entry.celebration.name,
      when: localWhen(entry.scheduled_date, entry.celebration.start_time),
      serviceOrderId: entry.serviceOrder?.id ?? assignment?.service_order_id ?? null,
      ministry: assignment?.ministry,
    };
  });

  // Escala sem par na agenda (outra congregação, ou agenda ainda sem a
  // instância) continua aparecendo: é compromisso da pessoa.
  for (const a of mine.values()) {
    items.push({
      id: a.id,
      celebrationName: a.celebration.name,
      when: localWhen(a.scheduled_date, a.celebration.start_time),
      serviceOrderId: a.service_order_id,
      ministry: a.ministry,
    });
  }

  return items.sort((x, y) => x.when.localeCompare(y.when));
}

export default function CelebracoesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useTheme();
  const roles = session ? decodeJwtPayload(session.accessToken)?.roles ?? [] : [];
  const isLeader = roles.some((r) => LEADER_ROLES.includes(r));

  const [items, setItems] = useState<CelebracaoListItem[] | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);

  useEffect(() => {
    let cancelled = false;

    const agenda: Promise<AgendaEntry[]> = isLeader ? listUpcomingInstances() : listAgenda();
    // Sem escala não é erro: papel que não tem a rota (secretary) só fica
    // sem as marcas de "escalado".
    const assignments = getMyAssignments().catch((): Assignment[] => []);

    const fetchItems = Promise.all([agenda, assignments]).then(([a, mine]) =>
      mergeAgenda(a, mine),
    );

    fetchItems
      .then((result) => {
        if (cancelled) return;
        setItems(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeLoadError(err, "as celebrações"));
      });

    return () => {
      cancelled = true;
    };
  }, [isLeader]);

  if (error) {
    return (
      <StatusMessage
        testID="celebracoes-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      />
    );
  }

  if (items && items.length === 0) {
    return (
      <StatusMessage
        testID="celebracoes-empty"
        icon={Church}
        message={EMPTY_MESSAGE}
        description="Os próximos cultos e eventos da igreja aparecem aqui."
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
          const when = formatDateTime(item.when);
          // A OC é de quem serve no culto ou o organiza; para os demais o
          // card só informa que haverá culto.
          const canSeeServiceOrder = isLeader || item.ministry !== undefined;
          const openServiceOrder =
            canSeeServiceOrder && item.serviceOrderId
              ? () =>
                  router.push(
                    item.ministry
                      ? `/celebracao/${item.serviceOrderId}?ministryId=${item.ministry.id}`
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
                <DateBlock iso={item.when} />
                <View style={styles.cardBody}>
                  <Text style={[typography.h3, { color: colors.textPrimary }]}>
                    {item.celebrationName}
                  </Text>
                  {when ? (
                    <Text style={[typography.caption, styles.when, { color: colors.textTertiary }]}>
                      {when}
                    </Text>
                  ) : null}
                  {item.ministry ? (
                    <Badge
                      testID={`celebracao-escalado-${item.id}`}
                      label={`Você serve em ${item.ministry.name}`}
                      tone="info"
                      style={styles.badge}
                    />
                  ) : null}
                  {!canSeeServiceOrder ? null : item.serviceOrderId ? (
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
  badge: { marginTop: spacing.sm },
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
