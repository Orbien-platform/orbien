// Campo de texto — altura 48 (§3, alvo de toque), radius 8 (§5), borda no
// token `border` e ícone lucide opcional à esquerda.
//
// O foco muda a borda para a cor da marca: sem isso, em aparelho pequeno
// nada indicava qual dos três campos do login estava ativo.
import { useState, type ComponentType } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, touchTarget, typography } from "../lib/theme/tokens";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

interface InputProps extends Omit<TextInputProps, "style" | "placeholderTextColor"> {
  label?: string;
  icon?: ComponentType<IconProps>;
  /** Botão à direita (ex.: mostrar/ocultar senha). */
  trailingIcon?: ComponentType<IconProps>;
  onTrailingPress?: () => void;
  trailingAccessibilityLabel?: string;
}

export function Input({
  label,
  icon: Icon,
  trailingIcon: TrailingIcon,
  onTrailingPress,
  trailingAccessibilityLabel,
  ...inputProps
}: InputProps) {
  const { primaryColor, colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[typography.label, styles.label, { color: colors.textTertiary }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.bgSurface,
            borderColor: focused ? primaryColor : colors.border,
          },
        ]}
      >
        {Icon ? (
          <Icon
            size={iconSize.inline}
            color={focused ? primaryColor : colors.textTertiary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
        ) : null}
        <TextInput
          {...inputProps}
          placeholderTextColor={colors.textTertiary}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          style={[styles.input, typography.bodyMedium, { color: colors.textPrimary }]}
        />
        {TrailingIcon ? (
          <Pressable
            onPress={onTrailingPress}
            accessibilityRole="button"
            accessibilityLabel={trailingAccessibilityLabel}
            hitSlop={spacing.md}
          >
            <TrailingIcon
              size={iconSize.inline}
              color={colors.textTertiary}
              strokeWidth={ICON_STROKE_WIDTH}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: { marginBottom: spacing.xs + 2 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, paddingVertical: spacing.md },
});
