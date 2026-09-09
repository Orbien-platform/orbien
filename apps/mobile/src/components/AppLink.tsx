// Ação textual — usada nos lugares que já eram <Text onPress=...> (ex.:
// "Tentar novamente", "Ver Ordem de Culto"), só trocando o visual, nunca o
// comportamento.
//
// Virou Pressable com padding: como <Text onPress> o alvo de toque era a
// caixa da própria linha de texto, ~20px de altura — metade do mínimo de
// 48 do §3 do guia. O padding vertical aqui é o que completa o alvo, e
// `hitSlop` cobre o resto sem inflar o desenho.
import type { ComponentType, ReactNode } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../lib/theme/tokens";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

interface AppLinkProps {
  testID?: string;
  onPress?: () => void;
  disabled?: boolean;
  icon?: ComponentType<IconProps>;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
}

export function AppLink({ testID, onPress, disabled, icon: Icon, style, children }: AppLinkProps) {
  const { primaryColor, colors } = useTheme();
  const color = disabled ? colors.textTertiary : primaryColor;

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={spacing.sm}
      {...(disabled !== undefined ? { accessibilityState: { disabled } } : {})}
      style={({ pressed }) => [styles.pressable, pressed && !disabled && styles.pressed]}
    >
      {Icon ? <Icon size={iconSize.inline} color={color} strokeWidth={ICON_STROKE_WIDTH} /> : null}
      <Text style={[typography.button, { color }, style]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.6 },
});
