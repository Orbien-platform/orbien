// Tela de detalhe da OC + setlist (MOB-08) — rota-filha do Stack raiz (fora
// de (tabs)), mesmo critério de post/[id].tsx e indisponibilidade.tsx: tela
// de detalhe empurrada por router.push, não uma seção própria de
// navegação. Destino do toque num item da aba Celebrações.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import { AppButton } from "../../components/AppButton";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { HttpError } from "../../lib/api/errors";
import { getServiceOrder } from "../../lib/celebracoes/celebracoes-client";
import type { ServiceOrder } from "../../lib/celebracoes/types";
import { useTheme } from "../../lib/theme/theme-provider";
import { colors, spacing, typography } from "../../lib/theme/tokens";

const NOT_FOUND_MESSAGE = "Ordem de culto não encontrada.";
const LOAD_ERROR_MESSAGE = "Não foi possível carregar a Ordem de Culto. Verifique sua conexão.";
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
  const theme = useTheme();
  const { id, ministryId } = useLocalSearchParams<{ id: string; ministryId?: string }>();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        setError(
          err instanceof HttpError && err.status === 404 ? NOT_FOUND_MESSAGE : LOAD_ERROR_MESSAGE,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id, retryCount]);

  if (error) {
    const canRetry = error === LOAD_ERROR_MESSAGE;
    return (
      <StatusMessage testID="celebracao-error" message={error} tone="danger">
        {canRetry ? (
          <AppButton
            testID="celebracao-retry"
            title="Tentar novamente"
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
    return <StatusMessage testID="celebracao-loading" message="Carregando…" />;
  }

  const items = [...order.items].sort((a, b) => a.sequence - b.sequence);

  return (
    <Screen testID="celebracao-detail">
      <Text testID="celebracao-title" style={styles.title}>
        {order.title}
      </Text>
      {order.published_at === null ? (
        <Text testID="celebracao-unpublished-warning" style={styles.warning}>
          {UNPUBLISHED_WARNING}
        </Text>
      ) : null}
      {items.map((item) => {
        const isMine = ministryId !== undefined && item.ministry?.id === ministryId;
        return (
          <Card
            key={item.id}
            testID={isMine ? `celebracao-item-${item.id}-mine` : `celebracao-item-${item.id}`}
            style={isMine ? [styles.item, { borderColor: theme.primaryColor, borderWidth: 2 }] : styles.item}
          >
            <Text style={typography.subtitle}>{item.name}</Text>
            <Text testID={`celebracao-item-${item.id}-horario`} style={styles.horario}>
              {`${formatOffset(item.start_offset_minutes)} · ${item.duration_minutes}min`}
            </Text>
            <Text style={styles.responsible}>
              {item.responsible_type === "person" && item.person
                ? item.person.full_name
                : item.responsible_type === "ministry" && item.ministry
                  ? item.ministry.name
                  : item.responsible_label}
            </Text>
            {item.setlist ? (
              item.setlist.songs.map((song) => (
                <Text key={song.id} style={styles.song}>
                  {song.title}
                </Text>
              ))
            ) : (
              <Text style={styles.noSetlist}>{NO_SETLIST_MESSAGE}</Text>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    marginBottom: spacing.sm,
  },
  warning: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  item: {
    marginBottom: spacing.md,
  },
  horario: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  responsible: {
    ...typography.body,
    marginTop: spacing.xs,
  },
  song: {
    ...typography.body,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
  noSetlist: {
    ...typography.caption,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
});
