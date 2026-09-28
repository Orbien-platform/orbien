// Tela de entrada da Bíblia (biblia-nvi-marcacoes-mobile, T18, BIB-01) —
// abre o `BookChapterPickerModal` e navega para `/biblia/[book]/[chapter]`
// ao confirmar; atalho para o feed da congregação (`/biblia/feed`).
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../components/AppButton";
import { BookChapterPickerModal } from "../../components/BookChapterPickerModal";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { BookOpen, ChevronRight, MessageSquare } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

export default function BibliaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  function handleSelect(bookCode: string, chapter: number) {
    setPickerVisible(false);
    router.push(`/biblia/${bookCode}/${chapter}`);
  }

  return (
    <Screen>
      <Text style={[typography.h1, styles.title, { color: colors.textPrimary }]}>Bíblia</Text>

      <AppButton
        testID="biblia-open-picker"
        title="Escolher livro e capítulo"
        icon={BookOpen}
        onPress={() => setPickerVisible(true)}
      />

      <Card
        testID="biblia-feed-shortcut"
        onPress={() => router.push("/biblia/feed")}
        accessibilityLabel="Feed da congregação"
        style={styles.shortcut}
      >
        <View style={styles.shortcutRow}>
          <MessageSquare
            size={iconSize.action}
            color={colors.textSecondary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
          <Text style={[typography.h3, styles.shortcutLabel, { color: colors.textPrimary }]}>
            Feed da congregação
          </Text>
          <ChevronRight
            size={iconSize.inline}
            color={colors.textTertiary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
        </View>
      </Card>

      <BookChapterPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleSelect}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  shortcut: { marginTop: spacing.lg },
  shortcutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  shortcutLabel: { flex: 1 },
});
