// Disponibilidade semanal editável (PROD-36, `EscalasScreen` → perfil da v2):
// sete dias, três turnos, cada turno um toque. Só vira rascunho na tela —
// "Salvar disponibilidade" é que chama a API, e fica desligado enquanto nada
// mudou. O `value` é o do servidor: o rascunho nasce dele, e quem usa o
// componente troca a `key` quando o servidor responde com outro valor.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DAYS, SLOTS } from "../../lib/escala/availability";
import { useTheme } from "../../lib/theme/theme-provider";
import { buttonHeight, radius, spacing, touchTarget, typography } from "../../lib/theme/tokens";
import { AppButton } from "../AppButton";

const DAY_NAMES: Record<string, string> = {
  sunday: "Domingo",
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
};

const SLOP = (touchTarget - buttonHeight.md) / 2;

type Draft = Record<string, string[]>;

function snapshot(value: Draft): Draft {
  return Object.fromEntries(DAYS.map(([day]) => [day, SLOTS.map(([s]) => s).filter((s) => value[day]?.includes(s))]));
}

function sameDraft(a: Draft, b: Draft): boolean {
  return DAYS.every(([day]) => (a[day] ?? []).join() === (b[day] ?? []).join());
}

interface AvailabilityEditorProps {
  value: Draft;
  saving: boolean;
  onSave: (availability: Draft) => void;
}

export function AvailabilityEditor({ value, saving, onSave }: AvailabilityEditorProps) {
  const { colors, primaryColor } = useTheme();
  const [draft, setDraft] = useState<Draft>(() => snapshot(value));

  const dirty = !sameDraft(draft, snapshot(value));

  function toggle(day: string, slot: string) {
    setDraft((current) => {
      const has = current[day]?.includes(slot);
      const next = has ? current[day].filter((s) => s !== slot) : [...(current[day] ?? []), slot];
      return snapshot({ ...current, [day]: next });
    });
  }

  return (
    <View testID="disponibilidade-editor">
      {DAYS.map(([day]) => (
        <View key={day} style={styles.row}>
          <Text style={[typography.bodyMedium, styles.day, { color: colors.textPrimary }]}>{DAY_NAMES[day]}</Text>
          <View style={styles.slots}>
            {SLOTS.map(([slot, label]) => {
              const active = draft[day]?.includes(slot) ?? false;
              return (
                <Pressable
                  key={slot}
                  testID={`disp-${day}-${slot}`}
                  onPress={() => toggle(day, slot)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${DAY_NAMES[day]} ${label}`}
                  accessibilityState={{ checked: active }}
                  hitSlop={{ top: SLOP, bottom: SLOP }}
                  style={[styles.pill, { backgroundColor: active ? primaryColor : colors.bgSubtle }]}
                >
                  <Text style={[typography.bodyMedium, { color: active ? colors.textOnBrand : colors.textSecondary }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <AppButton
        testID="disponibilidade-salvar"
        title="Salvar disponibilidade"
        disabled={!dirty}
        loading={saving}
        onPress={() => onSave(draft)}
        style={styles.save}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.xs },
  day: { width: 84 },
  slots: { flexDirection: "row", gap: spacing.sm, flexShrink: 1 },
  pill: {
    minHeight: buttonHeight.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  save: { marginTop: spacing.lg },
});
