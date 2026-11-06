// Aviso discreto de "a conexão voltou" para tela que NÃO pode reler sozinha:
// a pessoa já mexeu no que está na tela (PROD-32), e uma releitura
// automática sobrescreveria a edição. A releitura vira escolha dela.
import { Pressable, StyleSheet, Text } from "react-native";

import { RefreshCw } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, touchTarget, typography } from "../lib/theme/tokens";

interface ReconnectNoticeProps {
  testID?: string;
  onPress: () => void;
}

export function ReconnectNotice({ testID, onPress }: ReconnectNoticeProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Conexão voltou. Toque para atualizar"
      style={[styles.notice, { backgroundColor: colors.bgSubtle }]}
    >
      <RefreshCw size={iconSize.inline} color={colors.textSecondary} strokeWidth={ICON_STROKE_WIDTH} />
      <Text style={[typography.bodyMedium, styles.text, { color: colors.textPrimary }]}>
        Conexão voltou. Toque para atualizar
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touchTarget,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  text: { flex: 1 },
});
