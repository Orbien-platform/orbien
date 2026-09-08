// Tela Conteúdo (MOB-06, AC2) — lista os posts publicados da congregação.
// Paginação "carregar mais" (a API é offset/page, sem cursor/has_more —
// o cliente calcula se há mais páginas comparando page*limit com total).
// Mesmo padrão de erro/estado vazio de (tabs)/index.tsx (Escala): erro
// de rede visível, distinto de lista vazia.
import { useEffect, useRef, useState } from "react";
import { Button, FlatList, Text, View } from "react-native";

import { getPosts } from "../../lib/content/content-client";
import type { Post } from "../../lib/content/types";

const LIMIT = 20;
const LOAD_ERROR_MESSAGE = "Não foi possível carregar o conteúdo. Verifique sua conexão.";
const LOAD_MORE_ERROR_MESSAGE = "Não foi possível carregar mais posts. Tente novamente.";

export default function ConteudoScreen() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
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
      .catch(() => {
        if (cancelled) return;
        setError(LOAD_ERROR_MESSAGE);
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
      <View testID="conteudo-error" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>{error}</Text>
      </View>
    );
  }

  if (posts && posts.length === 0) {
    return (
      <View testID="conteudo-empty" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Nenhum post publicado ainda.</Text>
      </View>
    );
  }

  const hasMore = posts !== null && page * LIMIT < total;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        testID="conteudo-list"
        data={posts ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View testID={`post-${item.id}`}>
            <Text>{item.title}</Text>
            {item.body ? <Text>{item.body}</Text> : null}
          </View>
        )}
      />
      {loadMoreError ? <Text testID="load-more-error">{loadMoreError}</Text> : null}
      {hasMore ? (
        <Button
          testID="load-more-button"
          title="Carregar mais"
          disabled={isLoadingMore}
          onPress={handleLoadMore}
        />
      ) : null}
    </View>
  );
}
