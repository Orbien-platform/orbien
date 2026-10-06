// Minhas escalas (MOB-04, MHR-03; v2 `EscalasScreen` em
// docs/design/orbita-v2/produto/proto/app-screens2.jsx).
//
// Três abas na mesma pilha, como no protótipo:
// - Próximas: os slots do usuário (AC 1), confirmar/recusar um pendente
//   (AC 2, atualização otimista local — sem refetch, mesmo princípio de
//   apps/web/src/app/(admin)/voluntarios/page.tsx:169-232), check-in de um
//   confirmado (AC 3) e "Pedir troca", que abre `troca/[id]`;
// - Trocas: pedidos para mim e enviados (`SwapRequestsPanel`);
// - Meu perfil: o perfil de voluntário, leitura só (`VolunteerProfilePanel`).
//
// Escalas e pedidos recarregam a cada foco da tela: quem volta de "Pedir
// troca" já vê a escala marcada como "Troca pedida".
//
// Visual conforme STYLE-GUIDE.md: card de lista com o bloco de data à
// esquerda (§7), status em badge com dot (§7), `scheduled_date` em tela.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { Badge, type BadgeTone } from "../components/Badge";
import { Card } from "../components/Card";
import { DateBlock } from "../components/DateBlock";
import { Screen } from "../components/Screen";
import { SectionLabel } from "../components/SectionLabel";
import { Segmented } from "../components/Segmented";
import { StatusMessage } from "../components/StatusMessage";
import { SwapRequestsPanel } from "../components/escala/SwapRequestsPanel";
import { VolunteerProfilePanel } from "../components/escala/VolunteerProfilePanel";
import { HttpError } from "../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../lib/api/load-error";
import {
  checkIn,
  getMyAssignments,
  getMySwapRequests,
  respondToAssignment,
} from "../lib/escala/escala-client";
import type { Assignment, AssignmentStatus, MySwapRequests, SwapRequest } from "../lib/escala/types";
import { formatDateTime, localWhen } from "../lib/format/date";
import {
  ArrowLeftRight,
  CalendarCheck,
  CalendarOff,
  Church,
  CircleAlert,
  CircleCheck,
  WifiOff,
} from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../lib/theme/tokens";

const ACTION_ERROR_MESSAGE = "Não foi possível concluir a ação. Tente novamente.";
const NO_SWAPS: MySwapRequests = { incoming: [], outgoing: [] };

const STATUS_BADGE: Record<AssignmentStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pendente", tone: "info" },
  confirmed: { label: "Confirmado", tone: "success" },
  declined: { label: "Recusado", tone: "danger" },
  swapped: { label: "Trocado", tone: "neutral" },
};

type Tab = "proximas" | "trocas" | "perfil";

export default function EscalaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("proximas");
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [swaps, setSwaps] = useState<MySwapRequests | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Guarda contra duplo toque: um id em ação (respond ou check-in) não
  // dispara outra chamada até a primeira resolver — evita duas requests
  // para o mesmo assignment antes do estado atualizar e sumir com o
  // botão (achado do /code-review, PR #56). `pendingIdsRef` é a fonte da
  // verdade do guard (mutação síncrona, não espera re-render); `pendingIds`
  // (state) só existe para o `disabled` visual dos botões.
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    let cancelled = false;

    getMyAssignments()
      .then((result) => {
        if (cancelled) return;
        setAssignments(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeLoadError(err, "sua escala"));
      });

    // Os pedidos de troca são complemento: se falharem, as escalas continuam
    // na tela e a aba Trocas mostra o que houver (nada).
    getMySwapRequests()
      .then((result) => {
        if (!cancelled) setSwaps(result);
      })
      .catch(() => {
        if (!cancelled) setSwaps(NO_SWAPS);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(load);

  function updateAssignment(id: string, patch: Partial<Assignment>) {
    setAssignments((current) =>
      current ? current.map((a) => (a.id === id ? { ...a, ...patch } : a)) : current,
    );
  }

  function markPending(id: string): void {
    pendingIdsRef.current.add(id);
    setPendingIds(new Set(pendingIdsRef.current));
  }

  function clearPending(id: string): void {
    pendingIdsRef.current.delete(id);
    setPendingIds(new Set(pendingIdsRef.current));
  }

  async function handleRespond(id: string, status: "confirmed" | "declined") {
    if (pendingIdsRef.current.has(id)) return;
    markPending(id);
    setActionError(null);
    try {
      const updated = await respondToAssignment(id, status);
      updateAssignment(id, updated);
    } catch {
      setActionError(ACTION_ERROR_MESSAGE);
    } finally {
      clearPending(id);
    }
  }

  async function handleCheckIn(id: string) {
    if (pendingIdsRef.current.has(id)) return;
    markPending(id);
    setActionError(null);
    try {
      const updated = await checkIn(id);
      updateAssignment(id, updated);
    } catch (err) {
      // Check-in duplicado (race de duplo toque): design.md trata como
      // no-op silencioso — o botão já some após o primeiro sucesso.
      if (!(err instanceof HttpError && err.status === 409)) {
        setActionError(ACTION_ERROR_MESSAGE);
      }
    } finally {
      clearPending(id);
    }
  }

  function openSwap(item: Assignment, when: string | null) {
    router.push({
      pathname: "/troca/[id]",
      params: { id: item.id, ministerio: item.ministry.name, quando: when ?? "" },
    });
  }

  if (error) {
    return (
      <StatusMessage
        testID="escala-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      />
    );
  }

  // Pedido meu ainda em aberto, por escala: no card ele toma o lugar do botão.
  const openRequestByAssignment = new Map<string, SwapRequest>(
    (swaps?.outgoing ?? [])
      .filter((req) => req.status === "pending")
      .map((req) => [req.assignment.id, req]),
  );

  return (
    <Screen>
      <View style={styles.tabs}>
        <Segmented
          testID="escala-abas"
          value={tab}
          onChange={setTab}
          segments={[
            { value: "proximas", label: "Próximas" },
            { value: "trocas", label: "Trocas", count: swaps?.incoming.length },
            { value: "perfil", label: "Meu perfil" },
          ]}
        />
      </View>

      {tab === "trocas" ? (
        swaps ? (
          <SwapRequestsPanel swaps={swaps} onChanged={load} />
        ) : null
      ) : null}

      {tab === "perfil" ? <VolunteerProfilePanel /> : null}

      {tab === "proximas" ? (
        <>
          {actionError ? (
            <Alert messageTestID="escala-action-error" message={actionError} />
          ) : null}

          <FlatList
            testID="escala-list"
            data={assignments ?? []}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              assignments && assignments.length > 0 ? (
                <SectionLabel trailing={String(assignments.length)}>Próximas escalas</SectionLabel>
              ) : null
            }
            ListEmptyComponent={
              // `assignments === null` é "ainda carregando": vazio só vale
              // depois da resposta, senão a tela pisca "nenhuma escala" antes
              // de a lista chegar.
              assignments !== null ? (
                <View testID="escala-empty" style={styles.empty}>
                  <CalendarCheck
                    size={iconSize.emphasis}
                    color={colors.textTertiary}
                    strokeWidth={ICON_STROKE_WIDTH}
                  />
                  <Text style={[typography.h3, styles.emptyTitle, { color: colors.textPrimary }]}>
                    Nenhuma escala próxima
                  </Text>
                  <Text style={[typography.body, styles.emptyText, { color: colors.textSecondary }]}>
                    Quando o líder do ministério publicar a escala, ela aparece aqui.
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              <AppButton
                testID="indisponibilidade-link"
                title="Informar indisponibilidade"
                variant="secondary"
                icon={CalendarOff}
                onPress={() => router.push("/indisponibilidade")}
                style={styles.footer}
              />
            }
            renderItem={({ item }) => {
              const isPending = pendingIds.has(item.id);
              const badge = STATUS_BADGE[item.status];
              // `scheduled_date` é meia-noite UTC: cru, virava a véspera às
              // 21:00 em Brasília. `localWhen` devolve o dia com o horário do culto.
              const localIso = localWhen(item.scheduled_date, item.celebration.start_time);
              const when = formatDateTime(localIso);
              const openRequest = openRequestByAssignment.get(item.id);
              const canSwap =
                (item.status === "pending" || item.status === "confirmed") && !item.checked_in_at;

              return (
                <Card testID={`assignment-${item.id}`} style={styles.card}>
                  <View style={styles.cardRow}>
                    <DateBlock iso={localIso} />
                    <View style={styles.cardBody}>
                      <Text style={[typography.h3, { color: colors.textPrimary }]}>
                        {item.celebration.name}
                      </Text>
                      <View style={styles.metaRow}>
                        <Church
                          size={iconSize.inline}
                          color={colors.textTertiary}
                          strokeWidth={ICON_STROKE_WIDTH}
                        />
                        <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
                          {item.ministry.name}
                        </Text>
                      </View>
                      {when ? (
                        <Text style={[typography.caption, styles.when, { color: colors.textTertiary }]}>
                          {when}
                        </Text>
                      ) : null}
                    </View>
                    {item.checked_in_at ? (
                      <Badge
                        testID={`assignment-${item.id}-checked-in`}
                        label="Check-in"
                        tone="success"
                      />
                    ) : (
                      <Badge testID={`assignment-${item.id}-status`} {...badge} />
                    )}
                  </View>

                  {item.status === "pending" ? (
                    <View style={styles.actionsRow}>
                      <AppButton
                        testID={`confirm-${item.id}`}
                        title="Confirmar"
                        loading={isPending}
                        onPress={() => handleRespond(item.id, "confirmed")}
                        style={styles.actionButton}
                      />
                      <AppButton
                        testID={`decline-${item.id}`}
                        title="Recusar"
                        variant="secondary"
                        disabled={isPending}
                        onPress={() => handleRespond(item.id, "declined")}
                        style={styles.actionButton}
                      />
                    </View>
                  ) : null}

                  {item.status === "confirmed" && !item.checked_in_at ? (
                    <AppButton
                      testID={`check-in-${item.id}`}
                      title="Fazer check-in"
                      icon={CircleCheck}
                      loading={isPending}
                      onPress={() => handleCheckIn(item.id)}
                      style={styles.checkInButton}
                    />
                  ) : null}

                  {canSwap && openRequest ? (
                    <View testID={`swap-open-${item.id}`} style={styles.swapRow}>
                      <ArrowLeftRight
                        size={iconSize.inline}
                        color={colors.textTertiary}
                        strokeWidth={ICON_STROKE_WIDTH}
                      />
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        {openRequest.target
                          ? `Troca pedida a ${openRequest.target.full_name}`
                          : "Troca pedida ao ministério"}
                      </Text>
                    </View>
                  ) : null}
                  {canSwap && !openRequest && swaps ? (
                    <AppButton
                      testID={`swap-${item.id}`}
                      title="Pedir troca"
                      variant="ghost"
                      icon={ArrowLeftRight}
                      disabled={isPending}
                      onPress={() => openSwap(item, when)}
                      style={styles.swapButton}
                    />
                  ) : null}
                </Card>
              );
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { marginBottom: spacing.lg },
  card: { marginBottom: spacing.sm },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  cardBody: { flex: 1 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  when: { marginTop: spacing.xs },
  actionsRow: {
    flexDirection: "row",
    // 8px entre alvos de toque adjacentes (§3).
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionButton: { flex: 1 },
  checkInButton: { marginTop: spacing.lg },
  swapButton: { marginTop: spacing.sm },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  footer: { marginTop: spacing.md },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxxl,
  },
  emptyTitle: { marginTop: spacing.lg },
  emptyText: {
    marginTop: spacing.sm,
    textAlign: "center",
    maxWidth: 280,
  },
});
