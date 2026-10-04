// Lista agrupada da Órbita (`AList` do protótipo v2): linhas de 52px dentro
// de um card só, separadas por filete, com ícone num quadrado de 32px, título,
// linha de apoio e o chevron quando a linha navega. É o desenho da tela Mais
// e de qualquer menu de opções.
import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChevronRight } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, touchTarget, typography } from "../lib/theme/tokens";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export interface ListGroupItem {
  key: string;
  label: string;
  /** Linha de apoio, abaixo do título. */
  sub?: string;
  icon?: ComponentType<IconProps>;
  onPress?: () => void;
  /** Ação destrutiva (Sair): título em crimson, sem chevron. */
  danger?: boolean;
  testID?: string;
}

const ROW_MIN_HEIGHT = 52;
const ICON_BOX = 32;

export function ListGroup({ items, testID }: { items: ListGroupItem[]; testID?: string }) {
  const { colors } = useTheme();

  return (
    <View
      testID={testID}
      style={[styles.group, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const last = index === items.length - 1;
        const tint = item.danger ? colors.danger : colors.textPrimary;
        return (
          <Pressable
            key={item.key}
            testID={item.testID}
            onPress={item.onPress}
            disabled={!item.onPress}
            accessibilityRole={item.onPress ? "button" : undefined}
            accessibilityLabel={item.sub ? `${item.label}, ${item.sub}` : item.label}
            style={({ pressed }) => [
              styles.row,
              !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
              pressed && { backgroundColor: colors.bgSubtle },
            ]}
          >
            {Icon ? (
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: item.danger ? colors.dangerDim : colors.bgSubtle },
                ]}
              >
                <Icon
                  size={iconSize.inline}
                  color={item.danger ? colors.danger : colors.textSecondary}
                  strokeWidth={ICON_STROKE_WIDTH}
                />
              </View>
            ) : null}
            <View style={styles.text}>
              <Text style={[typography.body, { color: tint }]} numberOfLines={1}>
                {item.label}
              </Text>
              {item.sub ? (
                <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
                  {item.sub}
                </Text>
              ) : null}
            </View>
            {item.onPress && !item.danger ? (
              <ChevronRight
                size={iconSize.inline}
                color={colors.textTertiary}
                strokeWidth={ICON_STROKE_WIDTH}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  row: {
    minHeight: Math.max(ROW_MIN_HEIGHT, touchTarget),
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconBox: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: radius.avatar,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
});
