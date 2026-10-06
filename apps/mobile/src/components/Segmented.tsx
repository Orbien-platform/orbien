// Abas segmentadas (`Seg` do protótipo v2): um trilho no fundo sutil com o
// segmento ativo em superfície, como um interruptor de várias posições. Troca
// o conteúdo da mesma tela — Próximas / Trocas / Meu perfil em Minhas escalas
// — sem empilhar rota. Para escolher um valor de formulário, use `ChoiceChips`.
//
// Cada segmento tem 36px visíveis dentro do trilho e completa os 48 de toque
// com `hitSlop` (§3 do STYLE-GUIDE.md).
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { buttonHeight, radius, spacing, touchTarget, typography } from "../lib/theme/tokens";

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Contagem ao lado do rótulo (ex.: pedidos esperando resposta). */
  count?: number;
}

interface SegmentedProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

const TRACK_PADDING = spacing.xs;
const SEGMENT_HEIGHT = buttonHeight.md;
// O trilho soma o próprio padding à altura do segmento: o toque só precisa
// completar o resto até 48.
const SLOP = (touchTarget - SEGMENT_HEIGHT - 2 * TRACK_PADDING) / 2;
const COUNT_SIZE = spacing.xl;

export function Segmented<T extends string>({ segments, value, onChange, testID }: SegmentedProps<T>) {
  const { colors, primaryColor } = useTheme();

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: colors.bgSubtle }]}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            testID={testID ? `${testID}-${segment.value}` : undefined}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={
              segment.count ? `${segment.label}, ${segment.count} pendentes` : segment.label
            }
            hitSlop={{ top: SLOP, bottom: SLOP }}
            style={[styles.segment, active && { backgroundColor: colors.bgSurface }]}
          >
            <Text
              numberOfLines={1}
              style={[
                typography.bodyMedium,
                { color: active ? colors.textPrimary : colors.textSecondary },
              ]}
            >
              {segment.label}
            </Text>
            {segment.count ? (
              <View style={[styles.count, { backgroundColor: primaryColor }]}>
                <Text style={[typography.label, { color: colors.textOnBrand }]}>{segment.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: TRACK_PADDING,
    borderRadius: radius.pill,
    gap: TRACK_PADDING,
  },
  segment: {
    flex: 1,
    minHeight: SEGMENT_HEIGHT,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  count: {
    minWidth: COUNT_SIZE,
    height: COUNT_SIZE,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
});
