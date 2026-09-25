// Tela de leitura + marcação de versículo (biblia-nvi-marcacoes-mobile, T19 +
// T21, BIB-01/BIB-02/BIB-03/BIB-04/BIB-05) — busca o capítulo (cache-first
// no backend), exibe os versículos numerados e deixa marcar um trecho com
// comentário, que vai para o feed da congregação (`createMark`).
//
// O fluxo cabe em três toques e nunca sai do lugar onde a pessoa está lendo:
//
// 1. Tocar num versículo já o marca (um versículo é o caso comum — não pede
//    segundo toque). Tocar em outro estende a marcação até ele; tocar de
//    novo depois disso recomeça. Tocar no único marcado desmarca.
// 2. Com algo marcado, a barra fixa no rodapé mostra a referência ("João
//    3:16") e o botão "Comentar". Ela fica fora do scroll de propósito: num
//    capítulo de 50 versículos o botão no fim da lista era invisível para
//    quem marcou o versículo 3.
// 3. O comentário é escrito na própria barra e "Publicar no feed" grava. A
//    confirmação oferece o caminho até o feed.
//
// Padrão de erro/retry: mesmo de celebracao/[id].tsx (`retryCount` força o
// efeito a rodar de novo, StatusMessage com botão só quando a falha não é
// definitiva).
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Alert } from "../../../components/Alert";
import { AppButton } from "../../../components/AppButton";
import { Input } from "../../../components/Input";
import { Screen, useScreenPadding } from "../../../components/Screen";
import { StatusMessage } from "../../../components/StatusMessage";
import { HttpError } from "../../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import { createMark, getChapter } from "../../../lib/bible/bible-client";
import { formatVerseReference, useBookNames } from "../../../lib/bible/book-names";
import type { BibleChapter } from "../../../lib/bible/types";
import {
  CircleAlert,
  Highlighter,
  MessageSquare,
  RefreshCw,
  WifiOff,
  X,
} from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import {
  ICON_STROKE_WIDTH,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from "../../../lib/theme/tokens";

type VerseRange = { start: number; end: number };

// Espelha `CreateBibleVerseMarkDto` (backend): 3–2000 caracteres, mesmo
// limite de `CreatePrayerRequestDto` (spec.md, Assumptions).
const COMMENT_MIN = 3;
const COMMENT_MAX = 2000;
const VALIDATION_MESSAGE = `O comentário precisa ter entre ${COMMENT_MIN} e ${COMMENT_MAX} caracteres.`;
// Erro genérico para falha do backend sem mensagem específica (5xx, ex.
// 502 quando a API bíblica externa está fora do ar) — mesmo padrão de
// `EventRegistrationPanel.ACTION_ERROR`.
const SUBMIT_GENERIC_ERROR = "Não foi possível publicar o comentário. Tente novamente.";

/** 400/403 trazem mensagem da API pensada para o usuário final (validação,
 * "sem permissão"); 5xx (ex. 502 de falha do provedor externo) cai no
 * genérico — mesmo critério de `EventRegistrationPanel.describeActionError`. */
function describeSubmitError(err: unknown): string {
  return err instanceof HttpError && err.status < 500 ? err.message : SUBMIT_GENERIC_ERROR;
}

/** Regra do toque (ver o cabeçalho): marca um, estende até outro, recomeça. */
function nextRange(current: VerseRange | null, verseNumber: number): VerseRange | null {
  if (!current) return { start: verseNumber, end: verseNumber };
  if (current.start === current.end) {
    if (current.start === verseNumber) return null;
    return {
      start: Math.min(current.start, verseNumber),
      end: Math.max(current.start, verseNumber),
    };
  }
  return { start: verseNumber, end: verseNumber };
}

export default function BibliaChapterScreen() {
  const router = useRouter();
  const { colors, primaryColor, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const horizontalPadding = useScreenPadding();
  const bookNames = useBookNames();
  const { book, chapter: chapterParam, verse_start, verse_end } = useLocalSearchParams<{
    book: string;
    chapter: string;
    verse_start?: string;
    verse_end?: string;
  }>();
  const chapter = Number(chapterParam);

  const [data, setData] = useState<BibleChapter | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // Vindo do feed (BIB-06 AC4, "abrir a leitura completa... com o intervalo
  // em destaque"): a rota chega com `verse_start`/`verse_end` na query e o
  // capítulo já abre com esse intervalo marcado. Só lido na montagem (lazy
  // initializer) — depois disso o intervalo é o que o próprio usuário tocar.
  const [range, setRange] = useState<VerseRange | null>(() => {
    const start = Number(verse_start);
    const end = Number(verse_end);
    if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start) {
      return { start, end };
    }
    return null;
  });

  const [composerOpen, setComposerOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getChapter(book, chapter)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeLoadError(err, "o capítulo"));
      });

    return () => {
      cancelled = true;
    };
  }, [book, chapter, retryCount]);

  function handleVersePress(verseNumber: number) {
    setPublished(null);
    const next = nextRange(range, verseNumber);
    setRange(next);
    // Com o composer aberto, tocar em outro versículo só ajusta o trecho —
    // o rascunho continua. Desmarcar tudo fecha o composer: não há mais o
    // que comentar.
    if (!next) setComposerOpen(false);
  }

  function handleClearSelection() {
    setRange(null);
    setComposerOpen(false);
    setValidationError(null);
    setSubmitError(null);
  }

  function handleCancelComposer() {
    setComposerOpen(false);
    setComment("");
    setValidationError(null);
    setSubmitError(null);
  }

  async function handleSubmitComment() {
    const trimmed = comment.trim();
    if (trimmed.length < COMMENT_MIN || trimmed.length > COMMENT_MAX) {
      setValidationError(VALIDATION_MESSAGE);
      return;
    }
    if (!data || !range) return;

    setValidationError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      await createMark({
        book_code: data.book_code,
        chapter: data.chapter,
        verse_start: range.start,
        verse_end: range.end,
        comment: trimmed,
      });
      setComposerOpen(false);
      setComment("");
      setRange(null);
      setPublished(
        `${formatVerseReference(bookNames, data.book_code, data.chapter, range.start, range.end)} publicado no feed da congregação.`,
      );
    } catch (err) {
      setSubmitError(describeSubmitError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function isSelected(verseNumber: number): boolean {
    return range !== null && verseNumber >= range.start && verseNumber <= range.end;
  }

  if (error) {
    return (
      <StatusMessage
        testID="biblia-chapter-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton
          testID="biblia-chapter-retry"
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

  if (!data) {
    return (
      <StatusMessage testID="biblia-chapter-loading" icon={Highlighter} message="Carregando…" />
    );
  }

  const reference = range
    ? formatVerseReference(bookNames, data.book_code, data.chapter, range.start, range.end)
    : null;
  const showPanel = range !== null || published !== null;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bgBase }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen scroll testID="biblia-chapter-screen">
        <Text style={[typography.h1, { color: colors.textPrimary }]}>
          {formatVerseReference(bookNames, data.book_code, data.chapter)}
        </Text>
        <Text
          testID="biblia-chapter-hint"
          style={[typography.bodyMedium, styles.hint, { color: colors.textSecondary }]}
        >
          Toque em um versículo para comentar no feed da congregação.
        </Text>

        {data.verses.map((verse) => {
          const selected = isSelected(verse.number);
          return (
            <Pressable
              key={verse.number}
              testID={`biblia-verse-${verse.number}`}
              onPress={() => handleVersePress(verse.number)}
              accessibilityRole="button"
              accessibilityLabel={`Versículo ${verse.number}`}
              accessibilityState={{ selected }}
              style={[
                styles.verseRow,
                selected && { backgroundColor: colors.bgSubtle, borderColor: primaryColor },
              ]}
            >
              <Text style={[typography.caption, styles.verseNumber, { color: colors.textTertiary }]}>
                {verse.number}
              </Text>
              <Text style={[typography.body, styles.verseText, { color: colors.textPrimary }]}>
                {verse.text}
              </Text>
            </Pressable>
          );
        })}
      </Screen>

      {showPanel ? (
        <View
          testID="biblia-selection-bar"
          style={[
            styles.panel,
            shadow.md,
            {
              backgroundColor: colors.bgSurface,
              borderTopColor: colors.border,
              paddingHorizontal: horizontalPadding,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          {range && reference ? (
            <>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderText}>
                  <Text
                    testID="biblia-selection-reference"
                    style={[typography.h3, { color: colors.textPrimary }]}
                  >
                    {reference}
                  </Text>
                  {range.start === range.end ? (
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                      Para um trecho, toque também no último versículo.
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  testID="biblia-selection-clear"
                  onPress={handleClearSelection}
                  accessibilityRole="button"
                  accessibilityLabel="Desmarcar"
                  style={styles.clearButton}
                >
                  <X size={iconSize.action} color={colors.textSecondary} strokeWidth={ICON_STROKE_WIDTH} />
                </Pressable>
              </View>

              {composerOpen ? (
                <View testID="biblia-comment-composer">
                  <Input
                    testID="biblia-comment-input"
                    label="Comentário"
                    placeholder="O que esse trecho falou com você?"
                    value={comment}
                    onChangeText={(text) => {
                      setComment(text);
                      setValidationError(null);
                    }}
                    multiline
                    numberOfLines={4}
                    autoFocus
                  />
                  {validationError ? (
                    <Alert messageTestID="biblia-comment-validation-error" message={validationError} />
                  ) : null}
                  {submitError ? (
                    <Alert messageTestID="biblia-comment-submit-error" message={submitError} />
                  ) : null}
                  <View style={styles.actions}>
                    <AppButton
                      testID="biblia-comment-cancel"
                      title="Cancelar"
                      variant="secondary"
                      onPress={handleCancelComposer}
                      style={styles.actionButton}
                    />
                    <AppButton
                      testID="biblia-comment-submit"
                      title="Publicar no feed"
                      loading={submitting}
                      onPress={handleSubmitComment}
                      style={styles.actionButton}
                    />
                  </View>
                </View>
              ) : (
                <AppButton
                  testID="biblia-comment-cta"
                  title="Comentar"
                  icon={MessageSquare}
                  onPress={() => setComposerOpen(true)}
                />
              )}
            </>
          ) : published ? (
            <>
              <Alert messageTestID="biblia-comment-saved" tone="success" message={published} />
              <AppButton
                testID="biblia-open-feed"
                title="Ver no feed"
                variant="secondary"
                onPress={() => router.push("/biblia/feed")}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hint: { marginTop: spacing.xs, marginBottom: spacing.lg },
  verseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: "transparent",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  verseNumber: { width: 20, marginTop: 2, textAlign: "right" },
  verseText: { flex: 1 },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  panelHeaderText: { flex: 1 },
  clearButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionButton: { flex: 1 },
});
