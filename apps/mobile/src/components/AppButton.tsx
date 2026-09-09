// Botão do app (§7 do STYLE-GUIDE.md, "Botão primário").
//
// Specs que o guia fixa e este componente garante: altura 48 (que é também
// o alvo mínimo de toque do §3), padding horizontal 20, radius 8, texto no
// token `button` (peso 500, nunca 600), pressed por opacity 0.85 — mobile
// não tem hover —, e loading com spinner NO LUGAR do texto, sem mudar a
// largura do botão (o texto continua na árvore, invisível, para o layout
// não pular).
//
// "primary" usa a cor de marca do tenant (useTheme), então funciona igual
// em qualquer branding sem precisar saber a cor de antemão. Cor funcional
// ("danger") nunca é sobrescrita pelo tenant (§6).
import type { ComponentType } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, touchTarget, typography } from "../lib/theme/tokens";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

interface AppButtonProps {
  testID?: string;
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  /** Ícone lucide (outline, stroke 1.5 — §5), à esquerda do texto. */
  icon?: ComponentType<IconProps>;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  testID,
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  icon: Icon,
  style,
}: AppButtonProps) {
  const { primaryColor, colors } = useTheme();
  const isInactive = disabled || loading;

  // `disabled` do guia: fundo `bg-subtle`, texto `text-tertiary` — em vez
  // de opacity, que apagaria a cor da marca de forma diferente em cada
  // tenant.
  const surface: Record<Variant, string> = {
    primary: disabled ? colors.bgSubtle : primaryColor,
    secondary: colors.bgSurface,
    danger: disabled ? colors.bgSubtle : colors.danger,
    ghost: "transparent",
  };
  const label: Record<Variant, string> = {
    primary: disabled ? colors.textTertiary : colors.textOnBrand,
    secondary: disabled ? colors.textTertiary : primaryColor,
    danger: disabled ? colors.textTertiary : colors.textOnBrand,
    ghost: disabled ? colors.textTertiary : primaryColor,
  };
  const outline: Record<Variant, string> = {
    primary: "transparent",
    secondary: disabled ? colors.border : primaryColor,
    danger: "transparent",
    ghost: "transparent",
  };

  return (
    <Pressable
      testID={testID}
      onPress={isInactive ? undefined : onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: surface[variant], borderColor: outline[variant] },
        pressed && !isInactive ? styles.pressed : null,
        style,
      ]}
    >
      <View style={[styles.content, loading && styles.contentHidden]}>
        {Icon ? (
          <Icon size={iconSize.inline} color={label[variant]} strokeWidth={ICON_STROKE_WIDTH} />
        ) : null}
        <Text style={[typography.button, { color: label[variant] }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator
          testID={testID ? `${testID}-loading` : undefined}
          color={label[variant]}
          style={styles.spinner}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    borderRadius: radius.btn,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  // O texto sai de vista mas continua medindo: é o que impede o botão de
  // encolher quando o spinner entra.
  contentHidden: { opacity: 0 },
  spinner: { position: "absolute" },
  pressed: { opacity: 0.85 },
});
