// Escolha única em pills (o `Seg`/chips do protótipo v2): sexo, origem da
// visita. A escolhida ganha a cor da igreja; as outras ficam no fundo sutil.
// Cada pill tem 36px de altura visível e completa os 48 de toque com
// `hitSlop` (§3 do STYLE-GUIDE.md).
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../lib/theme/theme-provider";
import { buttonHeight, radius, spacing, touchTarget, typography } from "../lib/theme/tokens";

export interface Choice<T extends string> {
  value: T;
  label: string;
}

interface ChoiceChipsProps<T extends string> {
  options: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  testID?: string;
  accessibilityLabel?: string;
}

const SLOP = (touchTarget - buttonHeight.md) / 2;

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  testID,
  accessibilityLabel,
}: ChoiceChipsProps<T>) {
  const { primaryColor, colors } = useTheme();

  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={styles.row}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            hitSlop={{ top: SLOP, bottom: SLOP }}
            style={[
              styles.chip,
              { backgroundColor: active ? primaryColor : colors.bgSubtle },
            ]}
          >
            <Text
              style={[
                typography.bodyMedium,
                { color: active ? colors.textOnBrand : colors.textSecondary },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: buttonHeight.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
