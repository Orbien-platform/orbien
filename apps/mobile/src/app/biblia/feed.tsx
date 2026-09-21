// Tela `src/app/biblia/feed.tsx` (biblia-nvi-marcacoes-mobile, T22,
// BIB-06/BIB-07/BIB-08/BIB-09/BIB-10) — feed de marcações da congregação,
// mais recente primeiro, paginado por cursor (`before`, não offset — a API
// de feed é cursor-based, diferente de `getPosts`/conteudo.tsx). Isolamento
// cross-congregação/cross-tenant vem do RLS no backend (BIB-07); esta tela
// só lista o que `GET /bible/feed` devolve.
//
// Edição/exclusão usam `is_mine`/`can_delete` como a API já resolve — a
// tela nunca decide sozinha quem pode editar ou apagar (design.md, "Mobile:
// telas novas").
//
// Padrão de paginação/estado vazio/erro/guard de duplo toque adaptado de
// `(tabs)/conteudo.tsx` (lá é offset/page; aqui é cursor `before`).
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { Alert } from "../../components/Alert";
import { AppButton } from "../../components/AppButton";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { HttpError } from "../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { deleteMark, getFeed, updateMark } from "../../lib/bible/bible-client";
import type { BibleVerseMark } from "../../lib/bible/types";
import { formatDateTime } from "../../lib/format/date";
import { CircleAlert, MessageSquare, Pencil, Trash, WifiOff } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { spacing, typography } from "../../lib/theme/tokens";

const LOAD_MORE_ERROR_MESSAGE = "Não foi possível carregar mais marcações. Tente novamente.";
const DELETE_ERROR_MESSAGE = "Não foi possível apagar a marcação. Tente novamente.";
// Mesmo limite de `CreateBibleVerseMarkDto` (backend) e do composer de
// biblia/[book]/[chapter].tsx (T21).
const COMMENT_MIN = 3;
const COMMENT_MAX = 2000;
const VALIDATION_MESSAGE = `O comentário precisa ter entre ${COMMENT_MIN} e ${COMMENT_MAX} caracteres.`;
const EDIT_GENERIC_ERROR = "Não foi possível salvar a edição. Tente novamente.";

function describeActionError(err: unknown, fallback: string): string {
  return err instanceof HttpError && err.status < 500 ? err.message : fallback;
}

function verseRangeLabel(item: BibleVerseMark): string {
  const range = item.verse_start === item.verse_end ? `${item.verse_start}` : `${item.verse_start}-${item.verse_end}`;
  return `${item.book_code} ${item.chapter}:${range}`;
}

export default function BibliaFeedScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [items, setItems] = useState<BibleVerseMark[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // Mesmo guard síncrono de `conteudo.tsx`: `isLoadingMoreRef` é a fonte da
  // verdade (evita duplo toque disparando duas páginas), `isLoadingMore`
  // (state) só liga o spinner do botão.
  const isLoadingMoreRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editValidationError, setEditValidationError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getFeed()
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeLoadError(err, "o feed"));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadMore() {
    if (isLoadingMoreRef.current || !nextCursor) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const result = await getFeed({ before: nextCursor });
      setItems((current) => (current ?? []).concat(result.items));
      setNextCursor(result.nextCursor);
    } catch {
      setLoadMoreError(LOAD_MORE_ERROR_MESSAGE);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }

  function handleOpenChapter(item: BibleVerseMark) {
    router.push(
      `/biblia/${item.book_code}/${item.chapter}?verse_start=${item.verse_start}&verse_end=${item.verse_end}`,
    );
  }

  function handleStartEdit(item: BibleVerseMark) {
    setEditingId(item.id);
    setEditText(item.comment);
    setEditValidationError(null);
    setEditError(null);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditValidationError(null);
    setEditError(null);
  }

  async function handleSaveEdit(id: string) {
    const trimmed = editText.trim();
    if (trimmed.length < COMMENT_MIN || trimmed.length > COMMENT_MAX) {
      setEditValidationError(VALIDATION_MESSAGE);
      return;
    }

    setEditValidationError(null);
    setEditError(null);
    setEditSubmitting(true);
    try {
      const updated = await updateMark(id, trimmed);
      setItems((current) => (current ?? []).map((item) => (item.id === id ? updated : item)));
      setEditingId(null);
      setEditText("");
    } catch (err) {
      setEditError(describeActionError(err, EDIT_GENERIC_ERROR));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteMark(id);
      setItems((current) => (current ?? []).filter((item) => item.id !== id));
    } catch (err) {
      setDeleteError(describeActionError(err, DELETE_ERROR_MESSAGE));
    } finally {
      setDeletingId(null);
    }
  }

  if (error) {
    return (
      <StatusMessage
        testID="biblia-feed-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      />
    );
  }

  if (items && items.length === 0) {
    return (
      <StatusMessage
        testID="biblia-feed-empty"
        icon={MessageSquare}
        message="Nenhuma marcação ainda."
        description="As reflexões da sua congregação sobre a Bíblia aparecem aqui."
      />
    );
  }

  return (
    <Screen testID="biblia-feed-screen">
      {deleteError ? <Alert messageTestID="biblia-feed-delete-error" message={deleteError} /> : null}
      <FlatList
        testID="biblia-feed-list"
        data={items ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isEditing = editingId === item.id;
          return (
            <Card testID={`biblia-feed-item-${item.id}`}>
              {isEditing ? (
                <View testID={`biblia-feed-edit-form-${item.id}`}>
                  <Text style={[typography.h3, { color: colors.textPrimary }]}>
                    {verseRangeLabel(item)}
                  </Text>
                  <Input
                    testID={`biblia-feed-edit-input-${item.id}`}
                    label="Comentário"
                    value={editText}
                    onChangeText={(text) => {
                      setEditText(text);
                      setEditValidationError(null);
                    }}
                    multiline
                    numberOfLines={4}
                  />
                  {editValidationError ? (
                    <Alert
                      messageTestID={`biblia-feed-edit-validation-error-${item.id}`}
                      message={editValidationError}
                    />
                  ) : null}
                  {editError ? (
                    <Alert messageTestID={`biblia-feed-edit-error-${item.id}`} message={editError} />
                  ) : null}
                  <View style={styles.actionsRow}>
                    <AppButton
                      testID={`biblia-feed-edit-cancel-${item.id}`}
                      title="Cancelar"
                      variant="secondary"
                      onPress={handleCancelEdit}
                      style={styles.actionButton}
                    />
                    <AppButton
                      testID={`biblia-feed-edit-save-${item.id}`}
                      title="Salvar"
                      loading={editSubmitting}
                      onPress={() => handleSaveEdit(item.id)}
                      style={styles.actionButton}
                    />
                  </View>
                </View>
              ) : (
                <>
                  <Pressable
                    testID={`biblia-feed-item-open-${item.id}`}
                    onPress={() => handleOpenChapter(item)}
                    accessibilityRole="button"
                    accessibilityLabel={verseRangeLabel(item)}
                  >
                    <Text style={[typography.h3, { color: colors.textPrimary }]}>
                      {verseRangeLabel(item)}
                    </Text>
                    <Text style={[typography.body, styles.comment, { color: colors.textPrimary }]}>
                      {item.comment}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                      {item.person?.full_name ?? "Alguém"}
                      {formatDateTime(item.created_at) ? ` · ${formatDateTime(item.created_at)}` : ""}
                    </Text>
                  </Pressable>
                  {item.is_mine || item.can_delete ? (
                    <View style={styles.actionsRow}>
                      {item.is_mine ? (
                        <AppButton
                          testID={`biblia-feed-edit-${item.id}`}
                          title="Editar"
                          icon={Pencil}
                          variant="ghost"
                          onPress={() => handleStartEdit(item)}
                          style={styles.actionButton}
                        />
                      ) : null}
                      {item.can_delete ? (
                        <AppButton
                          testID={`biblia-feed-delete-${item.id}`}
                          title="Apagar"
                          icon={Trash}
                          variant="ghost"
                          loading={deletingId === item.id}
                          onPress={() => handleDelete(item.id)}
                          style={styles.actionButton}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}
            </Card>
          );
        }}
      />
      {loadMoreError ? (
        <Alert messageTestID="biblia-feed-load-more-error" message={loadMoreError} />
      ) : null}
      {nextCursor ? (
        <AppButton
          testID="biblia-feed-load-more"
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
  comment: { marginTop: spacing.xs, marginBottom: spacing.xs },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionButton: { flex: 1 },
  loadMoreButton: { marginTop: spacing.xs },
});
