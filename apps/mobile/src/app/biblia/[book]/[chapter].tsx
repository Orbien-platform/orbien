// Tela de leitura + seleção de versículo (biblia-nvi-marcacoes-mobile, T19 +
// T21, BIB-01/BIB-02/BIB-03/BIB-04/BIB-05) — busca o capítulo (cache-first
// no backend), exibe os versículos numerados, permite selecionar um
// intervalo tocando no primeiro e no último versículo desejado, e abre o
// composer de comentário (`createMark`) para publicar a marcação.
//
// Padrão de erro/retry: mesmo de celebracao/[id].tsx (`retryCount` força o
// efeito a rodar de novo, StatusMessage com botão só quando a falha não é
// definitiva).
//
// Composer embutido nesta tela, não em arquivo próprio: é um formulário
// pequeno (um `Input`, dois botões) que só existe em função do intervalo já
// selecionado aqui — mesmo critério de coesão que o design.md deixa em
// aberto ("composer embutido ou arquivo próprio, conforme ficar mais
// coeso").
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Alert } from "../../../components/Alert";
import { AppButton } from "../../../components/AppButton";
import { Input } from "../../../components/Input";
import { Screen } from "../../../components/Screen";
import { StatusMessage } from "../../../components/StatusMessage";
import { HttpError } from "../../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import { createMark, getChapter } from "../../../lib/bible/bible-client";
import type { BibleChapter } from "../../../lib/bible/types";
import { CircleAlert, Highlighter, MessageSquare, RefreshCw, WifiOff } from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { radius, spacing, typography } from "../../../lib/theme/tokens";

type VerseRange = { start: number; end: number | null };

// Espelha `CreateBibleVerseMarkDto` (backend): 3–2000 caracteres, mesmo
// limite de `CreatePrayerRequestDto` (spec.md, Assumptions).
const COMMENT_MIN = 3;
const COMMENT_MAX = 2000;
const VALIDATION_MESSAGE = `O comentário precisa ter entre ${COMMENT_MIN} e ${COMMENT_MAX} caracteres.`;
// Erro genérico para falha do backend sem mensagem específica (5xx, ex.
// 502 quando a API bíblica externa está fora do ar) — mesmo padrão de
// `EventRegistrationPanel.ACTION_ERROR`.
const SUBMIT_GENERIC_ERROR = "Não foi possível salvar a marcação. Tente novamente.";

/** 400/403 trazem mensagem da API pensada para o usuário final (validação,
 * "sem permissão"); 5xx (ex. 502 de falha do provedor externo) cai no
 * genérico — mesmo critério de `EventRegistrationPanel.describeActionError`. */
function describeSubmitError(err: unknown): string {
  return err instanceof HttpError && err.status < 500 ? err.message : SUBMIT_GENERIC_ERROR;
}

export default function BibliaChapterScreen() {
  const { colors, primaryColor } = useTheme();
  const { book, chapter: chapterParam } = useLocalSearchParams<{ book: string; chapter: string }>();
  const chapter = Number(chapterParam);

  const [data, setData] = useState<BibleChapter | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [range, setRange] = useState<VerseRange | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

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
    // Nova seleção invalida composer/confirmação em aberto — o intervalo que
    // eles se referiam não é mais o que está destacado na tela.
    setComposerOpen(false);
    setSavedMessage(null);
    setRange((current) => {
      // Sem seleção, ou seleção já fechada (start+end): este toque começa
      // uma seleção nova.
      if (!current || current.end !== null) {
        return { start: verseNumber, end: null };
      }
      // Só o primeiro toque aconteceu — este fecha o intervalo, em
      // qualquer ordem (toque no "último" pode vir antes ou depois do
      // "primeiro" na tela).
      return {
        start: Math.min(current.start, verseNumber),
        end: Math.max(current.start, verseNumber),
      };
    });
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
    if (!data || !range || range.end === null) return;

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
      setSavedMessage("Marcação salva com sucesso.");
    } catch (err) {
      setSubmitError(describeSubmitError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function isSelected(verseNumber: number): boolean {
    if (!range) return false;
    const end = range.end ?? range.start;
    return verseNumber >= range.start && verseNumber <= end;
  }

  const hasCompleteRange = range !== null && range.end !== null;

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

  return (
    <Screen scroll testID="biblia-chapter-screen">
      <Text style={[typography.h1, styles.title, { color: colors.textPrimary }]}>
        {`${data.book_code} ${data.chapter}`}
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

      {savedMessage ? (
        <Alert
          messageTestID="biblia-comment-saved"
          tone="success"
          message={savedMessage}
        />
      ) : null}

      {composerOpen && hasCompleteRange ? (
        <View testID="biblia-comment-composer" style={styles.composer}>
          <Text style={[typography.h3, { color: colors.textPrimary }]}>
            {`Comentar ${data.book_code} ${data.chapter}:${range.start}${
              range.end !== range.start ? `-${range.end}` : ""
            }`}
          </Text>
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
          />
          {validationError ? (
            <Alert messageTestID="biblia-comment-validation-error" message={validationError} />
          ) : null}
          {submitError ? (
            <Alert messageTestID="biblia-comment-submit-error" message={submitError} />
          ) : null}
          <View style={styles.composerActions}>
            <AppButton
              testID="biblia-comment-cancel"
              title="Cancelar"
              variant="secondary"
              onPress={handleCancelComposer}
              style={styles.composerButton}
            />
            <AppButton
              testID="biblia-comment-submit"
              title="Salvar"
              loading={submitting}
              onPress={handleSubmitComment}
              style={styles.composerButton}
            />
          </View>
        </View>
      ) : (
        <View style={styles.ctaRow}>
          <AppButton
            testID="biblia-comment-cta"
            title="Comentar"
            icon={MessageSquare}
            disabled={!hasCompleteRange}
            onPress={() => setComposerOpen(true)}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
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
  ctaRow: { marginTop: spacing.lg },
  composer: { marginTop: spacing.lg },
  composerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  composerButton: { flex: 1 },
});
