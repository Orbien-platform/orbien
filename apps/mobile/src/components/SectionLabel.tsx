// Rótulo de seção — token `label` do §2 (11px, peso 500, caps, tracking
// +10%). Serve para dar um cabeçalho às listas, que antes começavam
// direto no primeiro card sem dizer o que eram.
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";

interface SectionLabelProps {
  children: string;
  /** Contagem à direita (ex.: quantos itens a lista tem). */
  trailing?: string;
}

export function SectionLabel({ children, trailing }: SectionLabelProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[typography.label, { color: colors.textTertiary }]}>{children}</Text>
      {trailing ? (
        <Text style={[typography.label, { color: colors.textTertiary }]}>{trailing}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
});
