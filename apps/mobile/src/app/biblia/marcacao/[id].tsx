// Uma marcação do feed da Bíblia com as respostas — é para onde levam o
// contador de respostas do feed e o push "Fulano respondeu seu comentário".
//
// Respostas são lista simples, da mais antiga à mais nova, como conversa: sem
// resposta de resposta e sem edição (decisão de produto). Apagar segue o
// `can_delete` que a API resolve (autor ou moderação) — a tela nunca decide
// sozinha.
//
// O campo de resposta fica fixo embaixo, fora da lista: aqui o padrão de
// conversa é o certo — quem abriu esta tela veio para ler e responder, e a
// lista cresce para cima do campo, não o empurra para longe.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Alert } from "../../../components/Alert";
import { AppButton } from "../../../components/AppButton";
import { BibleMarkSocialBar } from "../../../components/BibleMarkSocialBar";
import { Input } from "../../../components/Input";
import { Screen } from "../../../components/Screen";
import { SectionLabel } from "../../../components/SectionLabel";
import { StatusMessage } from "../../../components/StatusMessage";
import { HttpError } from "../../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import { createReply, deleteReply, getMark, getReplies } from "../../../lib/bible/bible-client";
import { formatVerseReference, useBookNames } from "../../../lib/bible/book-names";
import type { BibleMarkReply, BibleVerseMark } from "../../../lib/bible/types";
import { formatDateTime } from "../../../lib/format/date";
import { CircleAlert, MessageSquare, RefreshCw, Trash, WifiOff } from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { spacing, typography } from "../../../lib/theme/tokens";

// Espelha `CreateBibleVerseMarkReplyDto` (backend).
const REPLY_MIN = 3;
const REPLY_MAX = 1000;
const VALIDATION_MESSAGE = `A resposta precisa ter entre ${REPLY_MIN} e ${REPLY_MAX} caracteres.`;
const SEND_ERROR = "Não foi possível enviar a resposta. Tente novamente.";
const DELETE_ERROR = "Não foi possível apagar a resposta. Tente novamente.";
const GONE_MESSAGE = "Esta marcação foi apagada.";

function describeActionError(err: unknown, fallback: string): string {
  return err instanceof HttpError && err.status < 500 ? err.message : fallback;
}

function byline(name: string | undefined, createdAt: string): string {
  const date = formatDateTime(createdAt);
  return `${name ?? "Alguém"}${date ? ` · ${date}` : ""}`;
}

export default function BibliaMarkScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const bookNames = useBookNames();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [mark, setMark] = useState<BibleVerseMark | null>(null);
  const [replies, setReplies] = useState<BibleMarkReply[]>([]);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [gone, setGone] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getMark(id), getReplies(id)])
      .then(([markResult, repliesResult]) => {
        if (cancelled) return;
        setMark(markResult);
        setReplies(repliesResult);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 404: a marcação foi apagada depois do push/feed que trouxe até
        // aqui — não é falha a tentar de novo.
        if (err instanceof HttpError && err.status === 404) setGone(true);
        else setError(describeLoadError(err, "a marcação"));
      });

    return () => {
      cancelled = true;
    };
  }, [id, retryCount]);

  async function handleSend() {
    const trimmed = draft.trim();
    if (trimmed.length < REPLY_MIN || trimmed.length > REPLY_MAX) {
      setSendError(VALIDATION_MESSAGE);
      return;
    }

    setSendError(null);
    setSending(true);
    try {
      const reply = await createReply(id, trimmed);
      setReplies((current) => current.concat(reply));
      setMark((current) => (current ? { ...current, reply_count: current.reply_count + 1 } : current));
      setDraft("");
    } catch (err) {
      setSendError(describeActionError(err, SEND_ERROR));
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(replyId: string) {
    if (deletingId) return;
    setDeletingId(replyId);
    setDeleteError(null);
    try {
      await deleteReply(id, replyId);
      setReplies((current) => current.filter((r) => r.id !== replyId));
      setMark((current) =>
        current ? { ...current, reply_count: Math.max(0, current.reply_count - 1) } : current,
      );
    } catch (err) {
      setDeleteError(describeActionError(err, DELETE_ERROR));
    } finally {
      setDeletingId(null);
    }
  }

  if (gone) {
    return <StatusMessage testID="biblia-mark-gone" icon={MessageSquare} message={GONE_MESSAGE} />;
  }

  if (error) {
    return (
      <StatusMessage
        testID="biblia-mark-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton
          testID="biblia-mark-retry"
          title="Tentar novamente"
          icon={RefreshCw}
          variant="secondary"
          onPress={() => {
            setError(null);
            setRetryCount((n) => n + 1);
          }}
        />
      </StatusMessage>
    );
  }

  if (!mark) {
    return <StatusMessage testID="biblia-mark-loading" icon={MessageSquare} message="Carregando…" />;
  }

  const reference = formatVerseReference(
    bookNames,
    mark.book_code,
    mark.chapter,
    mark.verse_start,
    mark.verse_end,
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bgBase }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen testID="biblia-mark-screen">
        <FlatList
          testID="biblia-mark-replies"
          style={styles.flex}
          data={replies}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.header}>
              <Pressable
                testID="biblia-mark-open-chapter"
                onPress={() =>
                  router.push(
                    `/biblia/${mark.book_code}/${mark.chapter}?verse_start=${mark.verse_start}&verse_end=${mark.verse_end}`,
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${reference}`}
              >
                <Text style={[typography.h2, { color: colors.textPrimary }]}>{reference}</Text>
              </Pressable>
              <Text style={[typography.body, styles.comment, { color: colors.textPrimary }]}>
                {mark.comment}
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>
                {byline(mark.person?.full_name, mark.created_at)}
              </Text>
              <BibleMarkSocialBar
                mark={mark}
                onLikeChange={(state) =>
                  setMark((current) =>
                    current ? { ...current, liked_by_me: state.liked, like_count: state.like_count } : current,
                  )
                }
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SectionLabel trailing={replies.length > 0 ? String(replies.length) : undefined}>
                Respostas
              </SectionLabel>
              {replies.length === 0 ? (
                <Text
                  testID="biblia-mark-no-replies"
                  style={[typography.bodyMedium, styles.empty, { color: colors.textSecondary }]}
                >
                  Ninguém respondeu ainda. Escreva a primeira resposta abaixo.
                </Text>
              ) : null}
              {deleteError ? <Alert messageTestID="biblia-reply-delete-error" message={deleteError} /> : null}
            </View>
          }
          renderItem={({ item }) => (
            <View testID={`biblia-reply-${item.id}`} style={styles.reply}>
              <View style={styles.replyBody}>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>
                  {byline(item.person?.full_name, item.created_at)}
                </Text>
                <Text style={[typography.body, { color: colors.textPrimary }]}>{item.comment}</Text>
              </View>
              {item.can_delete ? (
                <AppButton
                  testID={`biblia-reply-delete-${item.id}`}
                  title="Apagar"
                  icon={Trash}
                  variant="ghost"
                  loading={deletingId === item.id}
                  onPress={() => handleDelete(item.id)}
                />
              ) : null}
            </View>
          )}
        />

        <View style={[styles.composer, { borderTopColor: colors.border }]}>
          <Input
            testID="biblia-reply-input"
            label="Sua resposta"
            placeholder={`Responder a ${mark.person?.full_name ?? "este comentário"}`}
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              setSendError(null);
            }}
            multiline
          />
          {sendError ? <Alert messageTestID="biblia-reply-error" message={sendError} /> : null}
          <AppButton
            testID="biblia-reply-send"
            title="Responder"
            loading={sending}
            onPress={handleSend}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  comment: { marginTop: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
  empty: { marginTop: spacing.xs },
  reply: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  replyBody: { flex: 1, gap: spacing.xs },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
});
