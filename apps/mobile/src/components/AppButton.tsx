// Botão padrão do app — substitui o <Button> nativo (que não aceita
// padding/raio/fonte próprios) por um Pressable estilizado. "primary" usa a
// cor de marca do tenant (useTheme), então funciona igual em qualquer
// branding sem precisar saber a cor de antemão.
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { colors, radius, spacing } from "../lib/theme/tokens";

type Variant = "primary" | "secondary" | "danger";

interface AppButtonProps {
  testID?: string;
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  testID,
  title,
  onPress,
  disabled = false,
  variant = "primary",
  style,
}: AppButtonProps) {
  const theme = useTheme();

  const backgroundColor =
    variant === "primary" ? theme.primaryColor : variant === "danger" ? colors.danger : colors.surface;
  const textColor = variant === "secondary" ? theme.primaryColor : colors.textInverse;
  const borderColor = variant === "secondary" ? theme.primaryColor : "transparent";

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor, borderColor },
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text style={[styles.text, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});
