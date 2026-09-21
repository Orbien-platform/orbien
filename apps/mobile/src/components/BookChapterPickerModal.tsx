// BookChapterPickerModal (biblia-nvi-marcacoes-mobile, T17) — seletor
// customizado de livro → capítulo. Não há picker/select no design system
// mobile (achado da exploração em design.md): lista de livros, depois lista
// de capítulos, cada uma com `FlatList`+`Card`/toque, mesmo padrão visual
// do resto do app.
import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { describeLoadError, type LoadErrorState } from "../lib/api/load-error";
import { getBooks } from "../lib/bible/bible-client";
import type { BibleBook } from "../lib/bible/types";
import { ChevronRight, CircleAlert, WifiOff, X } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, touchTarget, typography } from "../lib/theme/tokens";
import { Card } from "./Card";
import { StatusMessage } from "./StatusMessage";

interface BookChapterPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (bookCode: string, chapter: number) => void;
}

export function BookChapterPickerModal({ visible, onClose, onSelect }: BookChapterPickerModalProps) {
  const { colors } = useTheme();
  const [books, setBooks] = useState<BibleBook[] | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    getBooks()
      .then((result) => {
        if (cancelled) return;
        setBooks(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeLoadError(err, "os livros da Bíblia"));
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  function handleClose() {
    setSelectedBook(null);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      testID="book-chapter-picker-modal"
    >
      <View style={[styles.container, { backgroundColor: colors.bgBase }]}>
        <View style={styles.header}>
          {selectedBook ? (
            <Pressable
              testID="picker-back"
              onPress={() => setSelectedBook(null)}
              accessibilityRole="button"
              accessibilityLabel="Voltar para a lista de livros"
              style={styles.headerButton}
            >
              <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Voltar</Text>
            </Pressable>
          ) : (
            <View style={styles.headerButton} />
          )}
          <Text style={[typography.h2, styles.title, { color: colors.textPrimary }]}>
            {selectedBook ? selectedBook.name : "Escolha o livro"}
          </Text>
          <Pressable
            testID="picker-close"
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            style={styles.headerButton}
          >
            <X size={iconSize.action} color={colors.textSecondary} strokeWidth={ICON_STROKE_WIDTH} />
          </Pressable>
        </View>

        {error ? (
          <StatusMessage
            testID="picker-error"
            icon={error.offline ? WifiOff : CircleAlert}
            message={error.message}
            description={error.description}
            tone="danger"
          />
        ) : !selectedBook ? (
          <FlatList
            key="book-list"
            testID="picker-book-list"
            data={books ?? []}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Card
                testID={`picker-book-${item.code}`}
                onPress={() => setSelectedBook(item)}
                accessibilityLabel={item.name}
              >
                <View style={styles.row}>
                  <Text style={[typography.h3, styles.rowLabel, { color: colors.textPrimary }]}>
                    {item.name}
                  </Text>
                  <ChevronRight
                    size={iconSize.inline}
                    color={colors.textTertiary}
                    strokeWidth={ICON_STROKE_WIDTH}
                  />
                </View>
              </Card>
            )}
          />
        ) : (
          <FlatList
            key="chapter-list"
            testID="picker-chapter-list"
            data={Array.from({ length: selectedBook.chapters }, (_, i) => i + 1)}
            keyExtractor={(chapter) => String(chapter)}
            numColumns={5}
            renderItem={({ item: chapter }) => (
              <Pressable
                testID={`picker-chapter-${chapter}`}
                onPress={() => onSelect(selectedBook.code, chapter)}
                accessibilityRole="button"
                accessibilityLabel={`Capítulo ${chapter}`}
                style={[styles.chapterCell, { borderColor: colors.border }]}
              >
                <Text style={[typography.body, { color: colors.textPrimary }]}>{chapter}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.xxl, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  headerButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowLabel: { flex: 1 },
  chapterCell: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.btn,
    alignItems: "center",
    justifyContent: "center",
    margin: spacing.xs,
  },
});
