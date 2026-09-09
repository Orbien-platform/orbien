// Bloco de 40px à esquerda do card de lista (§7, "Card de lista": avatar/
// ícone à esquerda, 40px). Duas formas: ícone lucide sobre `bg-subtle`, ou
// as iniciais de um nome — usado no roster de presença, onde cada linha é
// uma pessoa.
import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, typography } from "../lib/theme/tokens";

const SIZE = 40;

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

interface AvatarProps {
  icon?: ComponentType<IconProps>;
  /** Nome completo — vira até duas iniciais. */
  name?: string;
  /** Fundo; o padrão é `bg-subtle`. Passe a cor da marca para destacar. */
  background?: string;
  /** Cor do ícone/iniciais; o padrão é `text-secondary`. */
  foreground?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({ icon: Icon, name, background, foreground }: AvatarProps) {
  const { colors } = useTheme();
  const bg = background ?? colors.bgSubtle;
  const fg = foreground ?? colors.textSecondary;

  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      {Icon ? (
        <Icon size={iconSize.tabInactive} color={fg} strokeWidth={ICON_STROKE_WIDTH} />
      ) : (
        <Text style={[typography.h3, { color: fg }]}>{initials(name ?? "")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.avatar,
    alignItems: "center",
    justifyContent: "center",
  },
});
