// Estado vazio / de erro centralizado — o mesmo bloco `<View flex:1
// center>` se repetia, idêntico e sem nenhum estilo, em toda tela de
// lista/detalhe.
//
// O ícone é de 28px, que é o tamanho que o §5 do guia reserva para estado
// vazio, dentro de um círculo de `bg-subtle` para não ficar um traço solto
// no meio da tela. `children` carrega a ação opcional (ex.: "Tentar
// novamente").
import type { ComponentType, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, typography } from "../lib/theme/tokens";
import { Screen } from "./Screen";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

interface EmptyStateProps {
  testID: string;
  icon?: ComponentType<IconProps>;
  title: string;
  description?: string;
  tone?: "default" | "danger";
  children?: ReactNode;
}

export function EmptyState({
  testID,
  icon: Icon,
  title,
  description,
  tone = "default",
  children,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const accent = tone === "danger" ? colors.danger : colors.textTertiary;

  return (
    <Screen testID={testID} center>
      {Icon ? (
        <View
          style={[
            styles.halo,
            { backgroundColor: tone === "danger" ? colors.dangerDim : colors.bgSubtle },
          ]}
        >
          <Icon size={iconSize.emphasis} color={accent} strokeWidth={ICON_STROKE_WIDTH} />
        </View>
      ) : null}
      <Text
        style={[
          typography.h3,
          styles.title,
          { color: tone === "danger" ? colors.danger : colors.textPrimary },
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text style={[typography.body, styles.description, { color: colors.textSecondary }]}>
          {description}
        </Text>
      ) : null}
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  halo: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { textAlign: "center" },
  description: {
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    maxWidth: 320,
  },
});
