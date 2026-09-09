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
import { StatusMessage } from "../../components/StatusMessage";
import { HttpError } from "../../lib/api/errors";
import { getServiceOrder } from "../../lib/celebracoes/celebracoes-client";
import type { ServiceOrder } from "../../lib/celebracoes/types";
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

// Sem o horário de início da celebração no shape de ServiceOrder (design.md
// não o inclui), o horário de cada etapa é exibido como deslocamento a
// partir do início — mesma unidade que a API já guarda (AddItemModal.tsx
// converte na direção oposta, de "HH:mm" pra este mesmo campo).
function formatOffset(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return m > 0 ? `${h}h${m}min` : `${h}h`;
  return `${m}min`;
}

export default function CelebracaoScreen() {
  const { primaryColor, colors } = useTheme();
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

  const items = [...order.items].sort((a, b) => a.sequence - b.sequence);

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

      {items.map((item) => {
        const isMine = ministryId !== undefined && item.ministry?.id === ministryId;
        const responsible =
          item.responsible_type === "person" && item.person
            ? item.person.full_name
            : item.responsible_type === "ministry" && item.ministry
              ? item.ministry.name
              : item.responsible_label;

        return (
          <Card
            key={item.id}
            testID={isMine ? `celebracao-item-${item.id}-mine` : `celebracao-item-${item.id}`}
            highlightColor={isMine ? primaryColor : undefined}
          >
            <View style={styles.itemHeader}>
              <Text style={[typography.h3, styles.itemName, { color: colors.textPrimary }]}>
                {item.name}
              </Text>
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
                {`${formatOffset(item.start_offset_minutes)} · ${item.duration_minutes}min`}
              </Text>
            </View>

            {responsible ? (
              <Text style={[typography.bodyMedium, styles.responsible, { color: colors.textPrimary }]}>
                {responsible}
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
                      {song.title}
                    </Text>
                    {song.key ? (
                      <Text style={[typography.mono, { color: colors.textTertiary }]}>
                        {song.key}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[typography.caption, styles.noSetlist, { color: colors.textTertiary }]}>
                {NO_SETLIST_MESSAGE}
              </Text>
            )}
          </Card>
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
