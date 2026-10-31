// Alergia no Kids: ícone + texto, nunca só cor (design.md, "Direção visual").
// Amber é a cor funcional de atenção; o texto repete o que a cor diz.
import { StyleSheet, Text, View } from "react-native";

import { TriangleAlert } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, typography } from "../../lib/theme/tokens";

export function AllergyNote({ allergies, testID }: { allergies: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.note, { backgroundColor: colors.warningDim }]}>
      <TriangleAlert size={iconSize.inline} color={colors.warning} strokeWidth={ICON_STROKE_WIDTH} />
      <Text style={[typography.bodyMedium, styles.text, { color: colors.warning }]}>
        Alergia: {allergies}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.input,
    padding: spacing.md,
  },
  text: { flex: 1 },
});
