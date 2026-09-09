// Tela "Post" (MOB-07, AC4) — rota-filha do Stack raiz (fora de (tabs)),
// mesmo critério de indisponibilidade.tsx: tela de detalhe empurrada por
// router.push, não uma seção própria de navegação. Destino do toque numa
// push e de um item da lista de Conteúdo (T8).
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text } from "react-native";

import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { HttpError } from "../../lib/api/errors";
import { getPost } from "../../lib/content/content-client";
import type { Post } from "../../lib/content/types";
import { radius, spacing, typography } from "../../lib/theme/tokens";

const NOT_FOUND_MESSAGE = "Post não encontrado.";
const LOAD_ERROR_MESSAGE = "Não foi possível carregar o post. Verifique sua conexão.";

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          err instanceof HttpError && err.status === 404 ? NOT_FOUND_MESSAGE : LOAD_ERROR_MESSAGE,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return <StatusMessage testID="post-error" message={error} tone="danger" />;
  }

  if (!post) {
    return <StatusMessage testID="post-loading" message="Carregando…" />;
  }

  return (
    <Screen testID="post-detail">
      <Text testID="post-title" style={styles.title}>
        {post.title}
      </Text>
      {post.body ? (
        <Text testID="post-body" style={styles.body}>
          {post.body}
        </Text>
      ) : null}
      {post.media_url ? (
        <Image testID="post-media" source={{ uri: post.media_url }} style={styles.media} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    marginBottom: spacing.md,
  },
  media: {
    width: "100%",
    height: 200,
    borderRadius: radius.md,
  },
});
