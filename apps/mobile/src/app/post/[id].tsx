// Tela "Post" (MOB-07, AC4) — rota-filha do Stack raiz (fora de (tabs)),
// mesmo critério de indisponibilidade.tsx: tela de detalhe empurrada por
// router.push, não uma seção própria de navegação. Destino do toque numa
// push e de um item da lista de Conteúdo (T8).
//
// Visual conforme STYLE-GUIDE.md: `Screen scroll` porque o corpo do post
// cresce além da altura da tela e antes era cortado sem rolagem; imagem
// acima do texto, com radius de card (§5).
//
// PROD-25 — post de evento ganha aqui o bloco de quando/onde e, quando o
// organizador ligou inscrição, o `EventRegistrationPanel`. É a tela de
// member self-service que `POST .../registrations/me` esperava desde o
// PROD-16: até então a rota existia e nenhum front a chamava, e o QR do PIX
// que o PROD-24 passou a devolver não tinha onde aparecer.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";

import { AppLink } from "../../components/AppLink";
import { EventRegistrationPanel } from "../../components/EventRegistrationPanel";
import { MarkdownText } from "../../components/MarkdownText";
import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { HttpError } from "../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { getPost } from "../../lib/content/content-client";
import { isImageUrl } from "../../lib/content/media";
import type { Post } from "../../lib/content/types";
import { formatDateTime } from "../../lib/format/date";
import {
  CalendarDays,
  CircleAlert,
  ExternalLink,
  MapPin,
  Newspaper,
  WifiOff,
} from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, typography } from "../../lib/theme/tokens";

const NOT_FOUND_MESSAGE = "Post não encontrado.";

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);

  useEffect(() => {
    let cancelled = false;

    getPost(id)
      .then((result) => {
        if (cancelled) return;
        setPost(result);
      })
      .catch((err) => {
        if (cancelled) return;
        // 404 cobre tanto "id inexistente" quanto o Edge Case da spec (post
        // despublicado entre o disparo da push e o toque do usuário —
        // findOne, MOB-07 T1, esconde rascunho de member).
        setError(
          err instanceof HttpError && err.status === 404
            ? {
                message: NOT_FOUND_MESSAGE,
                description: "Ele pode ter sido removido ou despublicado.",
                offline: false,
              }
            : describeLoadError(err, "o post"),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <StatusMessage
        testID="post-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      />
    );
  }

  if (!post) {
    return <StatusMessage testID="post-loading" icon={Newspaper} message="Carregando…" />;
  }

  const hasImage = isImageUrl(post.media_url);

  return (
    <Screen scroll testID="post-detail">
      {/* Só imagem vira capa. PDF, áudio, vídeo e link externo também moram
          em `media_url`, e num <Image> apareciam como um retângulo vazio —
          esses viram um link "Abrir anexo" abaixo do corpo. */}
      {hasImage ? (
        <Image
          testID="post-media"
          source={{ uri: post.media_url! }}
          style={styles.media}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Text testID="post-title" style={[typography.h1, styles.title, { color: colors.textPrimary }]}>
        {post.title}
      </Text>
      {/* Quando e onde, antes do corpo: num post de evento é a primeira
          coisa que o membro procura, e vinha da API sem aparecer em tela
          nenhuma. `event_ends_at` fica de fora — a data de início mais o
          local respondem a pergunta, e a linha de término só apareceria em
          parte dos eventos. */}
      {post.event_starts_at || post.event_location ? (
        <View testID="post-event" style={styles.event}>
          {post.event_starts_at ? (
            <View style={styles.eventLine}>
              <CalendarDays
                size={iconSize.inline}
                color={colors.textSecondary}
                strokeWidth={ICON_STROKE_WIDTH}
              />
              <Text
                testID="post-event-date"
                style={[typography.bodyMedium, styles.eventText, { color: colors.textSecondary }]}
              >
                {formatDateTime(post.event_starts_at)}
              </Text>
            </View>
          ) : null}
          {post.event_location ? (
            <View style={styles.eventLine}>
              <MapPin
                size={iconSize.inline}
                color={colors.textSecondary}
                strokeWidth={ICON_STROKE_WIDTH}
              />
              <Text
                testID="post-event-location"
                style={[typography.bodyMedium, styles.eventText, { color: colors.textSecondary }]}
              >
                {post.event_location}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {post.body ? <MarkdownText testID="post-body">{post.body}</MarkdownText> : null}
      {post.media_url && !hasImage ? (
        <AppLink
          testID="post-attachment"
          icon={ExternalLink}
          onPress={() => {
            Linking.openURL(post.media_url!).catch(() => undefined);
          }}
          style={styles.attachment}
        >
          Abrir anexo
        </AppLink>
      ) : null}
      {/* Montado para todo post de evento, não só quando
          `registration_enabled` está ligado: o organizador pode desligar as
          inscrições com gente já inscrita, e quem tem vaga (ou um PIX
          pendente) precisa continuar podendo cancelar. Quem decide não
          desenhar nada é o painel, que já tem o resumo e a inscrição em
          mãos. Post comum não paga as chamadas. */}
      {post.type === "event" ? (
        <View style={styles.registration}>
          <EventRegistrationPanel postId={post.id} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // 16:9, o mesmo recorte do carrossel da home: a foto que a igreja
  // escolheu para o destaque aparece inteira aqui também.
  media: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.card,
    marginBottom: spacing.lg,
  },
  title: { marginBottom: spacing.md },
  event: { marginBottom: spacing.lg, gap: spacing.sm },
  eventLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  eventText: { flex: 1 },
  registration: { marginTop: spacing.xl },
  attachment: { marginTop: spacing.md },
});
