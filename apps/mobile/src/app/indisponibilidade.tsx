// Tela Indisponibilidade (MOB-05, AC 4) — ver/editar datas indisponíveis
// do mês. Mesmo princípio de cancelamento de request obsoleta de
// apps/web/src/components/volunteers/UnavailabilityPanel.tsx: ao trocar
// de mês rápido, só a resposta do mês selecionado por último é aplicada.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton } from "../components/AppButton";
import { Screen } from "../components/Screen";
import { getUnavailability, saveUnavailability } from "../lib/escala/escala-client";
import { useTheme } from "../lib/theme/theme-provider";
import { colors, radius, spacing, typography } from "../lib/theme/tokens";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const LOAD_ERROR_MESSAGE = "Não foi possível carregar sua indisponibilidade. Verifique sua conexão.";
const SAVE_ERROR_MESSAGE = "Não foi possível salvar. Tente novamente.";

export default function IndisponibilidadeScreen() {
  const theme = useTheme();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // Cancelamento evita que a resposta de um mês antigo (fora de ordem)
    // sobrescreva o mês selecionado por último.
    const signal = { cancelled: false };
    getUnavailability(month, year)
      .then((result) => {
        if (signal.cancelled) return;
        setSelectedDays(new Set((result?.dates ?? []).map((d) => d.date.slice(0, 10))));
        setSaved(false);
        setLoadError(null);
      })
      .catch(() => {
        if (signal.cancelled) return;
        setSelectedDays(new Set());
        // Erro visível — distingue "falha ao carregar" de "sem
        // indisponibilidade cadastrada" (tela vazia interpretável como
        // sem dado, mesmo princípio do Edge Case da spec para 403/lista
        // vazia).
        setLoadError(LOAD_ERROR_MESSAGE);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [month, year]);

  function toggleDay(day: number) {
    const key = dayKey(year, month, day);
    setSaved(false);
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function goToPreviousMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  async function handleSave() {
    setSaved(false);
    setSaveError(null);
    try {
      await saveUnavailability(month, year, Array.from(selectedDays).sort(), notes.trim() || undefined);
      setSaved(true);
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    }
  }

  const total = daysInMonth(year, month);
  const days = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <Screen>
      <View style={styles.monthRow}>
        <AppButton
          testID="prev-month"
          title="< Mês anterior"
          variant="secondary"
          onPress={goToPreviousMonth}
          style={styles.monthButton}
        />
        <Text testID="current-month" style={styles.monthLabel}>
          {`${month}/${year}`}
        </Text>
        <AppButton
          testID="next-month"
          title="Próximo mês >"
          variant="secondary"
          onPress={goToNextMonth}
          style={styles.monthButton}
        />
      </View>
      <View testID="days-grid" style={styles.daysGrid}>
        {days.map((day) => {
          const key = dayKey(year, month, day);
          const isSelected = selectedDays.has(key);
          return (
            <Pressable
              key={key}
              testID={`day-${key}`}
              onPress={() => toggleDay(day)}
              style={[
                styles.dayCell,
                isSelected && { backgroundColor: theme.primaryColor, borderColor: theme.primaryColor },
              ]}
            >
              <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                {isSelected ? `${day} ✓` : String(day)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        testID="notes-input"
        placeholder="Observação (opcional)"
        placeholderTextColor={colors.textMuted}
        value={notes}
        onChangeText={(text) => {
          setNotes(text);
          setSaved(false);
        }}
        style={styles.notesInput}
      />
      {loadError ? (
        <Text testID="load-error" style={styles.errorText}>
          {loadError}
        </Text>
      ) : null}
      {saveError ? (
        <Text testID="save-error" style={styles.errorText}>
          {saveError}
        </Text>
      ) : null}
      {saved ? (
        <Text testID="saved-message" style={styles.savedText}>
          Indisponibilidades salvas.
        </Text>
      ) : null}
      <AppButton testID="save-button" title="Salvar" onPress={handleSave} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  monthButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  monthLabel: {
    ...typography.subtitle,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  dayCell: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayLabel: {
    ...typography.caption,
    color: colors.text,
  },
  dayLabelSelected: {
    color: colors.textInverse,
    fontWeight: "700",
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginBottom: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  errorText: {
    color: colors.danger,
    marginBottom: spacing.md,
  },
  savedText: {
    color: colors.text,
    marginBottom: spacing.md,
  },
});
