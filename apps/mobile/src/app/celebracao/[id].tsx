// Tela de detalhe da OC + setlist (MOB-08) — rota-filha do Stack raiz (fora
// de (tabs)), mesmo critério de post/[id].tsx e indisponibilidade.tsx: tela
// de detalhe empurrada por router.push, não uma seção própria de
// navegação. Destino do toque num item da aba Celebrações.
//
// Visual conforme STYLE-GUIDE.md: `Screen scroll` (a OC é a tela que mais
// cresce e antes era cortada sem rolagem), aviso de "não publicada" como
// alerta com ícone em vez de linha vermelha solta, cada etapa com o
// horário em `mono` (§2 reserva a mono a valor/ID) e o repertório como
// lista com ícone, não linhas indentadas por margem.
//
// O destaque de "minha função" continua sendo o contorno na cor da marca —
// agora via `highlightColor` do Card, para não haver dois lugares
// desenhando borda.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "../../components/Alert";
import { AppButton } from "../../components/AppButton";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { StatusMessage } from "../../components/StatusMessage";
import { HttpError } from "../../lib/api/errors";
import { getServiceOrder } from "../../lib/celebracoes/celebracoes-client";
import type { ItemPhase, ServiceOrder } from "../../lib/celebracoes/types";
import { addMinutesToClock, formatOffsetFromStart } from "../../lib/format/clock";
import {
  CircleAlert,
  Clock,
  ListMusic,
  Music,
  RefreshCw,
  WifiOff,
} from "../../lib/theme/icons";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

const NOT_FOUND_MESSAGE = "Ordem de culto não encontrada.";
const UNPUBLISHED_WARNING = "Ordem de culto ainda não publicada — pode mudar.";
const NO_SETLIST_MESSAGE = "Repertório ainda não publicado";

const PHASE_LABELS: Record<ItemPhase, string> = {
  before: "Antes do culto",
  during: "Durante o culto",
  after: "Depois do culto",
};
const PHASE_ORDER: Record<ItemPhase, number> = { before: 0, during: 1, after: 2 };

export default function CelebracaoScreen() {
  const { brandInk, colors } = useTheme();
  const { id, ministryId } = useLocalSearchParams<{ id: string; ministryId?: string }>();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getServiceOrder(id)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
      })
      .catch((err) => {
        if (cancelled) return;
        const is404 = err instanceof HttpError && err.status === 404;
        setNotFound(is404);
        setError(
          is404
            ? { message: NOT_FOUND_MESSAGE, description: "", offline: false }
            : describeLoadError(err, "a Ordem de Culto"),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id, retryCount]);

  if (error) {
    // 404 não se resolve tentando de novo — só a falha de carregamento
    // (sem rede ou erro do servidor) ganha o botão de retry.
    const canRetry = !notFound;
    return (
      <StatusMessage
        testID="celebracao-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description || undefined}
        tone="danger"
      >
        {canRetry ? (
          <AppButton
            testID="celebracao-retry"
            title="Tentar novamente"
            icon={RefreshCw}
            variant="secondary"
            onPress={() => {
              setError(null);
              setRetryCount((n) => n + 1);
            }}
          />
        ) : null}
      </StatusMessage>
    );
  }

  if (!order) {
    return <StatusMessage testID="celebracao-loading" icon={ListMusic} message="Carregando…" />;
  }

  // Antes, durante e depois do culto; dentro de cada momento, a sequência.
  const items = [...order.items].sort(
    (a, b) =>
      PHASE_ORDER[a.phase ?? "during"] - PHASE_ORDER[b.phase ?? "during"] || a.sequence - b.sequence,
  );
  const startTime = order.celebrationInstance.celebration.start_time;

  return (
    <Screen scroll testID="celebracao-detail">
      <Text
        testID="celebracao-title"
        style={[typography.h1, styles.title, { color: colors.textPrimary }]}
      >
        {order.title}
      </Text>
      {order.published_at === null ? (
        <Alert messageTestID="celebracao-unpublished-warning" message={UNPUBLISHED_WARNING} />
      ) : null}

      {items.map((item, index) => {
        const phase = item.phase ?? "during";
        const startsPhase = index === 0 || (items[index - 1].phase ?? "during") !== phase;
        const isTeamTask = item.entry_kind === "logistics";
        const clock = addMinutesToClock(startTime, item.start_offset_minutes);
        const when = clock ?? formatOffsetFromStart(item.start_offset_minutes);
        const scheduled = (item.scheduled_volunteers ?? [])
          .map((v) => (v.status === "pending" ? `${v.full_name} (a confirmar)` : v.full_name))
          .join(", ");
        const isMine = ministryId !== undefined && item.ministry?.id === ministryId;
        const responsible =
          item.responsible_type === "person" && item.person
            ? item.person.full_name
            : item.responsible_type === "ministry" && item.ministry
              ? item.ministry.name
              : item.responsible_label;

        return (
          <View key={item.id}>
            {startsPhase ? (
              <View testID={`celebracao-phase-${phase}`}>
                <SectionLabel>{PHASE_LABELS[phase]}</SectionLabel>
              </View>
            ) : null}
          <Card
            testID={isMine ? `celebracao-item-${item.id}-mine` : `celebracao-item-${item.id}`}
            highlightColor={isMine ? brandInk : undefined}
          >
            <View style={styles.itemHeader}>
              <Text style={[typography.h3, styles.itemName, { color: colors.textPrimary }]}>
                {item.name}
              </Text>
              {isTeamTask ? <Badge label="Equipe" /> : null}
              {isMine ? <Badge label="Minha função" tone="info" /> : null}
            </View>

            <View style={styles.metaRow}>
              <Clock
                size={iconSize.inline}
                color={colors.textTertiary}
                strokeWidth={ICON_STROKE_WIDTH}
              />
              {/* Token `mono` (§2): valor, alinhado entre etapas. */}
              <Text
                testID={`celebracao-item-${item.id}-horario`}
                style={[typography.mono, { color: colors.textSecondary }]}
              >
                {item.duration_minutes > 0 ? `${when} · ${item.duration_minutes}min` : when}
              </Text>
            </View>

            {responsible ? (
              <Text style={[typography.bodyMedium, styles.responsible, { color: colors.textPrimary }]}>
                {responsible}
              </Text>
            ) : null}

            {scheduled ? (
              <Text
                testID={`celebracao-item-${item.id}-escala`}
                style={[typography.caption, styles.responsible, { color: colors.textSecondary }]}
              >
                {`Na escala: ${scheduled}`}
              </Text>
            ) : null}

            {item.setlist ? (
              <View style={styles.setlist}>
                {item.setlist.songs.map((song) => (
                  <View key={song.id} style={styles.songRow}>
                    <Music
                      size={iconSize.inline}
                      color={colors.textTertiary}
                      strokeWidth={ICON_STROKE_WIDTH}
                    />
                    <Text style={[typography.body, styles.songTitle, { color: colors.textPrimary }]}>
                      {song.version_label ? `${song.title} — ${song.version_label}` : song.title}
                    </Text>
                    {song.key ? (
                      <Text style={[typography.mono, { color: colors.textTertiary }]}>
                        {song.key}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : isTeamTask ? null : (
              <Text style={[typography.caption, styles.noSetlist, { color: colors.textTertiary }]}>
                {NO_SETLIST_MESSAGE}
              </Text>
            )}
          </Card>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  itemName: { flex: 1 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  responsible: { marginTop: spacing.sm },
  setlist: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  songRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  songTitle: { flex: 1 },
  noSetlist: {
    fontStyle: "italic",
    marginTop: spacing.md,
  },
});
