// Cartão (§7 do STYLE-GUIDE.md, "Card de lista"): padding 16, radius 12,
// `shadow-sm`, superfície semântica. Vira Pressable quando recebe onPress
// — e aí o toque vale no card inteiro, nunca numa área específica dentro
// dele, como o guia exige.
//
// Pressed usa `bg-subtle` em vez de opacity: o guia reserva o pressed a
// essa cor (§8, "Hover/pressed") e opacity num card com sombra apaga a
// sombra junto, o que fica pior no escuro.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { radius, spacing } from "../lib/theme/tokens";

interface CardProps {
  testID?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Contorno de destaque (ex.: "minha função" na Ordem de Culto). */
  highlightColor?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function Card({
  testID,
  onPress,
  accessibilityLabel,
  highlightColor,
  style,
  children,
}: CardProps) {
  const { colors, shadow } = useTheme();

  const base: ViewStyle = {
    backgroundColor: colors.bgSurface,
    borderColor: highlightColor ?? colors.border,
    borderWidth: highlightColor ? 2 : 1,
  };

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.card,
          shadow.sm,
          base,
          pressed && { backgroundColor: colors.bgSubtle },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[styles.card, shadow.sm, base, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    padding: spacing.lg,
    // Gap de 12 entre cards (§7) — aplicado como margem do próprio card
    // para funcionar tanto em `map` quanto em `renderItem` de FlatList,
    // que não aceita `gap` do contêiner.
    marginBottom: spacing.md,
  },
});
