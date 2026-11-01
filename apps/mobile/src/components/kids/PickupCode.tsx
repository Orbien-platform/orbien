// Código de retirada do Kids — o elemento memorável da tela do responsável
// (design.md, "Direção visual"): 4 caracteres grandes, tabular e espaçados,
// à esquerda. O mesmo código vai na etiqueta da criança e na do responsável.
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../lib/theme/theme-provider";
import { pickupCode, radius, spacing, typography } from "../../lib/theme/tokens";

export function PickupCode({ code, testID }: { code: string; testID?: string }) {
  const { colors, primaryColor } = useTheme();
  return (
    <View
      style={[styles.plate, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`Código de retirada ${code.split("").join(" ")}`}
    >
      <Text style={[typography.label, { color: colors.textTertiary }]}>Código de retirada</Text>
      <Text testID={testID} style={[pickupCode, styles.code, { color: primaryColor }]}>
        {code}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.xxl,
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  // O tracking soma espaço depois do último caractere; sem recuar, o código
  // parece deslocado para a esquerda do cartão.
  code: { marginRight: -pickupCode.letterSpacing },
});
