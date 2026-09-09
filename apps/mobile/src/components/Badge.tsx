// Badge de status (§7 do STYLE-GUIDE.md): radius pill, padding 4×10, token
// `label`, e — a regra que importa — **dot + texto, nunca só cor de
// fundo**, para o status continuar legível para daltônicos.
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { radius, spacing, typography } from "../lib/theme/tokens";

export type BadgeTone = "neutral" | "info" | "success" | "danger";

interface BadgeProps {
  testID?: string;
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ testID, label, tone = "neutral", style }: BadgeProps) {
  const { colors } = useTheme();

  // Cor funcional não é sobrescrita pelo tenant (§6): sucesso é teal e
  // erro é crimson em qualquer marca.
  const palette: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: colors.bgSubtle, fg: colors.textSecondary },
    info: { bg: colors.badgeNavyBg, fg: colors.badgeNavyText },
    success: { bg: colors.successDim, fg: colors.success },
    danger: { bg: colors.dangerDim, fg: colors.danger },
  };
  const { bg, fg } = palette[tone];

  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: bg }, style]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[typography.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
