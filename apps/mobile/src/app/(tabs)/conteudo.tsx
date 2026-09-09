// Tela Conteúdo (MOB-06, AC2) — lista os posts publicados da congregação.
// Paginação "carregar mais" (a API é offset/page, sem cursor/has_more —
// o cliente calcula se há mais páginas comparando page*limit com total).
// Mesmo padrão de erro/estado vazio de (tabs)/index.tsx (Escala): erro
// de rede visível, distinto de lista vazia.
//
// Visual conforme STYLE-GUIDE.md: o corpo do post era renderizado inteiro
// no token de caption (11px), o que virava um bloco ilegível quando o post
// era longo. Agora vem em `body` com `numberOfLines`, e o card inteiro
// abre o detalhe (§7).
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";

import { Alert } from "../../components/Alert";
import { AppButton } from "../../components/AppButton";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { StatusMessage } from "../../components/StatusMessage";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { getPosts } from "../../lib/content/content-client";
import type { Post } from "../../lib/content/types";
import { ChevronRight, CircleAlert, Inbox, WifiOff } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, typography } from "../../lib/theme/tokens";

const LIMIT = 20;
const LOAD_MORE_ERROR_MESSAGE = "Não foi possível carregar mais posts. Tente novamente.";

export default function ConteudoScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // Guarda contra duplo toque: sem isso, dois toques rápidos em "Carregar
  // mais" disparam duas requisições da mesma página e duplicam posts na
  // lista (achado do /code-review, PR #56). `isLoadingMoreRef` é a fonte
  // da verdade do guard (mutação síncrona, não espera re-render);
  // `isLoadingMore` (state) só existe para o `disabled` visual do botão.
  const isLoadingMoreRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getPosts(1, LIMIT)
      .then((result) => {
        if (cancelled) return;
        setPosts(result.data);
        setTotal(result.total);
        setPage(1);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeLoadError(err, "o conteúdo"));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadMore() {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = page + 1;
      const result = await getPosts(nextPage, LIMIT);
      setPosts((current) => (current ?? []).concat(result.data));
      setTotal(result.total);
      setPage(nextPage);
    } catch {
      setLoadMoreError(LOAD_MORE_ERROR_MESSAGE);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }

  if (error) {
    return (
      <StatusMessage
        testID="conteudo-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      />
    );
  }

  if (posts && posts.length === 0) {
    return (
      <StatusMessage
        testID="conteudo-empty"
        icon={Inbox}
        message="Nenhum post publicado ainda."
        description="Avisos e devocionais da sua igreja aparecem aqui."
      />
    );
  }

  const hasMore = posts !== null && page * LIMIT < total;

  return (
    <Screen>
      <FlatList
        testID="conteudo-list"
        data={posts ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          posts && posts.length > 0 ? <SectionLabel>Publicações</SectionLabel> : null
        }
        renderItem={({ item }) => (
          <Card
            testID={`post-${item.id}`}
            onPress={() => router.push(`/post/${item.id}`)}
            accessibilityLabel={item.title}
          >
            {item.media_url ? (
              <Image
                source={{ uri: item.media_url }}
                style={styles.thumb}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : null}
            <View style={styles.cardRow}>
              <View style={styles.cardBody}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>{item.title}</Text>
                {item.body ? (
                  <Text
                    style={[typography.body, styles.body, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {item.body}
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
        )}
      />
      {loadMoreError ? (
        <Alert messageTestID="load-more-error" message={loadMoreError} />
      ) : null}
      {hasMore ? (
        <AppButton
          testID="load-more-button"
          title="Carregar mais"
          variant="secondary"
          loading={isLoadingMore}
          onPress={handleLoadMore}
          style={styles.loadMoreButton}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: "100%",
    height: 140,
    borderRadius: radius.btn,
    marginBottom: spacing.md,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardBody: { flex: 1 },
  body: { marginTop: spacing.xs },
  loadMoreButton: { marginTop: spacing.xs },
});
