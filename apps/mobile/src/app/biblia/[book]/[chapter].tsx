// Tela de leitura + seleção de versículo (biblia-nvi-marcacoes-mobile, T19,
// BIB-01/BIB-02/BIB-03/BIB-04) — busca o capítulo (cache-first no backend),
// exibe os versículos numerados e permite selecionar um intervalo tocando
// no primeiro e no último versículo desejado.
//
// SPEC_DEVIATION: o CTA "Comentar" habilita/desabilita conforme o intervalo
// selecionado, mas NÃO chama `createMark` nem abre o composer — isso é T21
// (Fase M3, próximo batch). tasks.md divide a marcação em T19 (leitura +
// seleção) e T21 (composer + submissão); a divisão é do próprio plano de
// tarefas, não uma decisão tomada aqui.
//
// Padrão de erro/retry: mesmo de celebracao/[id].tsx (`retryCount` força o
// efeito a rodar de novo, StatusMessage com botão só quando a falha não é
// definitiva).
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../../components/AppButton";
import { Screen } from "../../../components/Screen";
import { StatusMessage } from "../../../components/StatusMessage";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import { getChapter } from "../../../lib/bible/bible-client";
import type { BibleChapter } from "../../../lib/bible/types";
import { CircleAlert, Highlighter, MessageSquare, RefreshCw, WifiOff } from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { radius, spacing, typography } from "../../../lib/theme/tokens";

type VerseRange = { start: number; end: number | null };

export default function BibliaChapterScreen() {
  const { colors, primaryColor } = useTheme();
  const { book, chapter: chapterParam } = useLocalSearchParams<{ book: string; chapter: string }>();
  const chapter = Number(chapterParam);

  const [data, setData] = useState<BibleChapter | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [range, setRange] = useState<VerseRange | null>(null);

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

      <View style={styles.ctaRow}>
        <AppButton
          testID="biblia-comment-cta"
          title="Comentar"
          icon={MessageSquare}
          disabled={!hasCompleteRange}
          onPress={() => {
            // SPEC_DEVIATION: submissão real (composer + createMark) é T21.
          }}
        />
      </View>
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
});
