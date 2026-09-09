// Tela "Post" (MOB-07, AC4) — rota-filha do Stack raiz (fora de (tabs)),
// mesmo critério de indisponibilidade.tsx: tela de detalhe empurrada por
// router.push, não uma seção própria de navegação. Destino do toque numa
// push e de um item da lista de Conteúdo (T8).
//
// Visual conforme STYLE-GUIDE.md: `Screen scroll` porque o corpo do post
// cresce além da altura da tela e antes era cortado sem rolagem; imagem
// acima do texto, com radius de card (§5).
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text } from "react-native";

import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { HttpError } from "../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { getPost } from "../../lib/content/content-client";
import type { Post } from "../../lib/content/types";
import { CircleAlert, Newspaper, WifiOff } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { radius, spacing, typography } from "../../lib/theme/tokens";

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

  return (
    <Screen scroll testID="post-detail">
      {post.media_url ? (
        <Image
          testID="post-media"
          source={{ uri: post.media_url }}
          style={styles.media}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Text testID="post-title" style={[typography.h1, styles.title, { color: colors.textPrimary }]}>
        {post.title}
      </Text>
      {post.body ? (
        <Text testID="post-body" style={[typography.body, { color: colors.textSecondary }]}>
          {post.body}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  media: {
    width: "100%",
    height: 200,
    borderRadius: radius.card,
    marginBottom: spacing.lg,
  },
  title: { marginBottom: spacing.md },
});
