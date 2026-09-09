// Bloco de data à esquerda do card (dia grande, mês em caps). Ocupa a vaga
// de 40px que o §7 do guia reserva para avatar/ícone no card de lista.
//
// Existe porque `scheduled_date` e `occurred_at` chegavam da API e não
// apareciam em tela nenhuma: a Escala listava celebração e ministério sem
// dizer *quando*, que é a primeira coisa que um voluntário procura.
import { StyleSheet, Text, View } from "react-native";

import { formatDayMonth } from "../lib/format/date";
import { useTheme } from "../lib/theme/theme-provider";
import { radius, spacing, typography } from "../lib/theme/tokens";

interface DateBlockProps {
  /** Data ISO-8601 vinda da API. */
  iso: string;
}

export function DateBlock({ iso }: DateBlockProps) {
  const { colors, primaryColor } = useTheme();
  const parts = formatDayMonth(iso);

  if (!parts) return null;

  return (
    <View style={[styles.block, { backgroundColor: colors.bgSubtle }]}>
      <Text style={[typography.h3, { color: primaryColor }]}>{parts.day}</Text>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>
        {parts.month.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    width: 44,
    paddingVertical: spacing.sm,
    borderRadius: radius.avatar,
    alignItems: "center",
    justifyContent: "center",
  },
});
