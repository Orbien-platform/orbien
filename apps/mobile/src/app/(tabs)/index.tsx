// Tela Escala (MOB-04) — substitui o placeholder de rota-raiz. Lista os
// próximos slots do usuário (AC 1), permite confirmar/recusar um slot
// pendente (AC 2, atualização otimista local — sem refetch, mesmo
// princípio de apps/web/src/app/(admin)/voluntarios/page.tsx:169-232) e
// fazer check-in de um slot confirmado (AC 3, botão some após sucesso).
// A identidade (logo do tenant, ou a marca da Orbien na versão genérica)
// aparece no topo desta tela, via `BrandHeader` — é a única aba que a
// mostra, e ela substituiu a barra de header que o Stack desenhava em todas
// (ver src/app/_layout.tsx). O nome vem do tema, nunca de literal.
//
// Visual conforme STYLE-GUIDE.md: card de lista com o bloco de data à
// esquerda (§7), status em badge com dot (§7 — a lista antes não dizia em
// que estado cada escala estava), e `scheduled_date` finalmente em tela:
// o campo já vinha da API e não era mostrado em lugar nenhum, então a
// escala não dizia *quando*.
//
// Home (HOME-01..05, .specs/features/home-dashboard-mobile/): esta é a
// aba raiz, então é a home do app, não só a escala. Saudação por horário
// (sem nome — o app não guarda nome/e-mail do usuário em lugar nenhum, ver
// perfil.tsx) e dois destaques secundários, "Meus grupos" e "Avisos
// recentes", de fontes já usadas em outras abas sem gate de papel
// (`listMyGroups`, `getPosts`). Os dois degradam em silêncio: falha ou
// lista vazia só omite a seção, nunca disputa espaço com o erro de escala
// (que é o dado principal da tela) nem aparece como alerta.
// `listUpcomingInstances` (Celebrações) fica fora de propósito — é
// exclusiva de `ministry_leader`+.
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Alert } from "../../components/Alert";
import { AppButton } from "../../components/AppButton";
import { Avatar } from "../../components/Avatar";
import { BrandHeader } from "../../components/BrandHeader";
import { Badge, type BadgeTone } from "../../components/Badge";
import { Card } from "../../components/Card";
import { DateBlock } from "../../components/DateBlock";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { StatusMessage } from "../../components/StatusMessage";
import { HttpError } from "../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { getPosts } from "../../lib/content/content-client";
import type { Post } from "../../lib/content/types";
import { checkIn, getMyAssignments, respondToAssignment } from "../../lib/escala/escala-client";
import type { Assignment, AssignmentStatus } from "../../lib/escala/types";
import { formatDateTime, getGreeting } from "../../lib/format/date";
import { listMyGroups } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { SmallGroupMine } from "../../lib/pequenos-grupos/types";
import {
  CalendarCheck,
  CalendarOff,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Church,
  Clock,
  Newspaper,
  WifiOff,
} from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

const ACTION_ERROR_MESSAGE = "Não foi possível concluir a ação. Tente novamente.";

// HOME-02: 2 grupos cabem sem a home virar uma segunda tela de Grupos.
const MAX_HOME_GROUPS = 2;
// HOME-03: mesmo limite já pedido à API — evita truncar client-side algo
// que o backend já poderia ter paginado menor.
const MAX_HOME_POSTS = 3;

const STATUS_BADGE: Record<AssignmentStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pendente", tone: "info" },
  confirmed: { label: "Confirmado", tone: "success" },
  declined: { label: "Recusado", tone: "danger" },
  swapped: { label: "Trocado", tone: "neutral" },
};

export default function EscalaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
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
  // Destaques secundários da home (HOME-02/03): `null` = ainda não
  // chegou (não desenha nada, igual ao `assignments` acima); erro cai no
  // `catch` sem `setError` — a seção some, a tela não trava por isso.
  const [groups, setGroups] = useState<SmallGroupMine[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
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

    listMyGroups()
      .then((result) => {
        if (cancelled) return;
        setGroups(result);
      })
      .catch(() => undefined);

    getPosts(1, MAX_HOME_POSTS)
      .then((result) => {
        if (cancelled) return;
        setPosts(result.data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);
  const greeting = getGreeting(new Date());

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

  return (
    <Screen>
      <BrandHeader />
      <Text
        testID="home-greeting"
        style={[typography.h2, styles.greeting, { color: colors.textPrimary }]}
      >
        {greeting}
      </Text>
      <Card
        testID="indisponibilidade-link"
        onPress={() => router.push("/indisponibilidade")}
        accessibilityLabel="Minha indisponibilidade"
        style={styles.shortcut}
      >
        <View style={styles.shortcutRow}>
          <CalendarOff
            size={iconSize.action}
            color={colors.textSecondary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
          <Text style={[typography.h3, styles.shortcutLabel, { color: colors.textPrimary }]}>
            Minha indisponibilidade
          </Text>
          <ChevronRight
            size={iconSize.inline}
            color={colors.textTertiary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
        </View>
      </Card>

      {groups && groups.length > 0 ? (
        <View testID="home-groups-section" style={styles.section}>
          <SectionLabel>Meus grupos</SectionLabel>
          {groups.slice(0, MAX_HOME_GROUPS).map((group) => (
            <Card
              key={group.id}
              testID={`home-group-${group.id}`}
              onPress={() => router.push(`/grupo/${group.id}`)}
              accessibilityLabel={group.name}
            >
              <View style={styles.highlightRow}>
                <Avatar name={group.name} />
                <View style={styles.cardBody}>
                  <Text style={[typography.h3, { color: colors.textPrimary }]}>{group.name}</Text>
                  {group.meeting_time ? (
                    <View style={styles.metaRow}>
                      <Clock
                        size={iconSize.inline}
                        color={colors.textTertiary}
                        strokeWidth={ICON_STROKE_WIDTH}
                      />
                      <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
                        {group.meeting_time}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <ChevronRight
                  size={iconSize.inline}
                  color={colors.textTertiary}
                  strokeWidth={ICON_STROKE_WIDTH}
                />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {posts && posts.length > 0 ? (
        <View testID="home-posts-section" style={styles.section}>
          <SectionLabel>Avisos recentes</SectionLabel>
          {posts.slice(0, MAX_HOME_POSTS).map((post) => (
            <Card
              key={post.id}
              testID={`home-post-${post.id}`}
              onPress={() => router.push(`/post/${post.id}`)}
              accessibilityLabel={post.title}
            >
              <View style={styles.highlightRow}>
                <Avatar icon={Newspaper} />
                <View style={styles.cardBody}>
                  <Text
                    style={[typography.h3, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {post.title}
                  </Text>
                  {post.published_at ? (
                    <Text
                      style={[typography.caption, styles.when, { color: colors.textTertiary }]}
                    >
                      {formatDateTime(post.published_at)}
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
          ))}
        </View>
      ) : null}

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
                Quando você for escalado, a escala aparece aqui.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isPending = pendingIds.has(item.id);
          const badge = STATUS_BADGE[item.status];
          const when = formatDateTime(item.scheduled_date);

          return (
            <Card testID={`assignment-${item.id}`}>
              <View style={styles.cardRow}>
                <DateBlock iso={item.scheduled_date} />
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
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  shortcut: { marginBottom: spacing.lg },
  shortcutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  shortcutLabel: { flex: 1 },
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
