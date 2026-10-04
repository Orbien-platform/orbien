// Tela de leitura + marcação de versículo (biblia-nvi-marcacoes-mobile, T19 +
// T21, BIB-01/BIB-02/BIB-03/BIB-04/BIB-05) — busca o capítulo (cache-first
// no backend), exibe os versículos numerados e deixa marcar um trecho com
// comentário, que vai para o feed da congregação (`createMark`).
//
// O fluxo cabe em três toques e acontece onde a pessoa está lendo:
//
// 1. Tocar num versículo já o marca — um versículo basta, não há segundo
//    toque obrigatório. Tocar em outro estende a marcação até ele; tocar de
//    novo depois disso recomeça. Tocar no único marcado desmarca.
// 2. Logo abaixo do último versículo marcado aparece "Comentar João 3:16".
//    Fica ali, e não num rodapé ou no fim da lista, porque num capítulo
//    longo o fim fica longe e o rodapé fica longe do olho de quem tocou.
// 3. O comentário é escrito numa folha própria (Modal), que cita o texto do
//    trecho — é isso que vai para o feed. "Publicar no feed" grava; a
//    confirmação aparece no mesmo lugar e oferece o caminho até o feed.
//
// Padrão de erro/retry: mesmo de celebracao/[id].tsx (`retryCount` força o
// efeito a rodar de novo, StatusMessage com botão só quando a falha não é
// definitiva).
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
  quoteRuleWidth,
  radius,
  spacing,
  touchTarget,
  typography,
} from "../../../lib/theme/tokens";

type VerseRange = { start: number; end: number };

// Coluna do número do versículo. A ação inline usa o mesmo recuo para ficar
// alinhada ao texto, lida como parte do trecho recém-marcado.
const VERSE_NUMBER_WIDTH = 20;

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
  const { colors, primaryColor } = useTheme();
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
  // A confirmação fica ancorada no versículo onde a marcação terminava — é
  // onde a pessoa está olhando quando a folha fecha.
  const [published, setPublished] = useState<{ afterVerse: number; message: string } | null>(null);

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
    setRange(nextRange(range, verseNumber));
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
      setPublished({
        afterVerse: range.end,
        message: `${formatVerseReference(bookNames, data.book_code, data.chapter, range.start, range.end)} publicado no feed da congregação.`,
      });
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
  const quotedVerses = range
    ? data.verses.filter((v) => v.number >= range.start && v.number <= range.end)
    : [];

  return (
    <>
      <Screen scroll testID="biblia-chapter-screen">
        <Text style={[typography.h1, { color: colors.textPrimary }]}>
          {formatVerseReference(bookNames, data.book_code, data.chapter)}
        </Text>
        <Text
          testID="biblia-chapter-hint"
          style={[typography.bodyMedium, styles.hint, { color: colors.textSecondary }]}
        >
          Toque em um versículo para comentar. Para vários, toque no primeiro e no último.
        </Text>

        {data.verses.map((verse) => {
          const selected = isSelected(verse.number);
          return (
            <View key={verse.number}>
              <Pressable
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

              {range && reference && verse.number === range.end ? (
                <View testID="biblia-selection-actions" style={styles.inlineActions}>
                  <AppButton
                    testID="biblia-comment-cta"
                    title={`Comentar ${reference}`}
                    icon={MessageSquare}
                    onPress={() => setComposerOpen(true)}
                    style={styles.inlinePrimary}
                  />
                  <Pressable
                    testID="biblia-selection-clear"
                    onPress={() => setRange(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Desmarcar"
                    style={[styles.iconButton, { borderColor: colors.border }]}
                  >
                    <X size={iconSize.action} color={colors.textSecondary} strokeWidth={ICON_STROKE_WIDTH} />
                  </Pressable>
                </View>
              ) : null}

              {published && published.afterVerse === verse.number ? (
                <View style={styles.inlineActions}>
                  <View style={styles.inlinePrimary}>
                    <Alert messageTestID="biblia-comment-saved" tone="success" message={published.message} />
                  </View>
                  <AppButton
                    testID="biblia-open-feed"
                    title="Ver no feed"
                    variant="secondary"
                    onPress={() => router.push("/biblia/feed")}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </Screen>

      <Modal
        visible={composerOpen && range !== null}
        animationType="slide"
        onRequestClose={handleCancelComposer}
        testID="biblia-comment-sheet"
      >
        <KeyboardAvoidingView
          style={[styles.flex, { backgroundColor: colors.bgBase }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            testID="biblia-comment-composer"
            style={[
              styles.sheet,
              {
                paddingHorizontal: horizontalPadding,
                paddingTop: insets.top + spacing.lg,
                paddingBottom: insets.bottom + spacing.sm,
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[typography.h2, styles.flex, { color: colors.textPrimary }]}>
                {reference}
              </Text>
              <Pressable
                testID="biblia-comment-close"
                onPress={handleCancelComposer}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                style={styles.iconButton}
              >
                <X size={iconSize.action} color={colors.textSecondary} strokeWidth={ICON_STROKE_WIDTH} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
            >
              <View
                testID="biblia-comment-quote"
                style={[styles.quote, { borderLeftColor: primaryColor }]}
              >
                {quotedVerses.map((v) => (
                  <Text key={v.number} style={[typography.body, { color: colors.textSecondary }]}>
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>{`${v.number} `}</Text>
                    {v.text}
                  </Text>
                ))}
              </View>

              <Input
                testID="biblia-comment-input"
                label="Seu comentário"
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
            </ScrollView>

            <View style={styles.sheetActions}>
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
        </KeyboardAvoidingView>
      </Modal>
    </>
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
  verseNumber: { width: VERSE_NUMBER_WIDTH, marginTop: 2, textAlign: "right" },
  verseText: { flex: 1 },
  inlineActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    marginLeft: VERSE_NUMBER_WIDTH + spacing.sm + spacing.xs,
  },
  inlinePrimary: { flex: 1 },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.btn,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: { flex: 1 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sheetBody: { paddingTop: spacing.lg, gap: spacing.lg },
  quote: { borderLeftWidth: quoteRuleWidth, paddingLeft: spacing.md, gap: spacing.xs },
  sheetActions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.sm },
  actionButton: { flex: 1 },
});
