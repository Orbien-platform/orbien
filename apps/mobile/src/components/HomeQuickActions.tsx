// HomeQuickActions (T10, .specs/features/mobile-home-redesign/) — grade
// de CTAs/ícones da nova Home (Bíblia, Contribuição, Ver todos os
// conteúdos, Escala [gated], Celebrações — MHR-07/08/09/11).
//
// Item `disabled` não recebe `onPress` (mesmo padrão de AppLink.tsx): sem
// handler nenhum, o toque não dispara nada — não é um `if` dentro do
// callback que poderia divergir do estado visual.
import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { IconProps } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, touchTarget, typography } from "../lib/theme/tokens";
import { Card } from "./Card";

export type LucideIcon = ComponentType<IconProps>;

export interface QuickAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
}

interface HomeQuickActionsProps {
  items: QuickAction[];
}

export function HomeQuickActions({ items }: HomeQuickActionsProps) {
  return (
    <View testID="home-quick-actions" style={styles.grid}>
      {items.map((item) => (
        <QuickActionItem key={item.key} item={item} />
      ))}
    </View>
  );
}

function QuickActionItem({ item }: { item: QuickAction }) {
  const { colors, accentReadable } = useTheme();
  const Icon = item.icon;
  const iconColor = item.disabled ? colors.textTertiary : accentReadable;
  const labelColor = item.disabled ? colors.textTertiary : colors.textPrimary;

  return (
    <Card
      testID={`quick-action-${item.key}`}
      onPress={item.disabled ? undefined : item.onPress}
      accessibilityLabel={item.label}
      style={[styles.item, item.disabled ? styles.disabled : null]}
    >
      <Icon size={iconSize.action} color={iconColor} strokeWidth={ICON_STROKE_WIDTH} />
      <Text style={[typography.bodyMedium, styles.label, { color: labelColor }]} numberOfLines={2}>
        {item.label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  item: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    width: "30%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginBottom: 0,
  },
  disabled: { opacity: 0.5 },
  label: { textAlign: "center" },
});
