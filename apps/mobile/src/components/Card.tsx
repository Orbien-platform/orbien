// Cartão de item de lista — usado nas telas de Escala, Grupos, Celebrações,
// Conteúdo, roster de presença e materiais de encontro, que repetiam a
// mesma linha "sem nenhum estilo" dentro de FlatList/renderItem. Vira
// Pressable quando recebe onPress, senão é só um View.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, spacing } from "../lib/theme/tokens";

interface CardProps {
  testID?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function Card({ testID, onPress, style, children }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
