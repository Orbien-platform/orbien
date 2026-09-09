// Tela Indisponibilidade (MOB-05, AC 4) — ver/editar datas indisponíveis
// do mês. Mesmo princípio de cancelamento de request obsoleta de
// apps/web/src/components/volunteers/UnavailabilityPanel.tsx: ao trocar
// de mês rápido, só a resposta do mês selecionado por último é aplicada.
//
// Visual conforme STYLE-GUIDE.md: era uma fileira de células de 44px em
// `flexWrap`, sem alinhamento por dia da semana, o mês escrito "9/2026" e
// a seleção indicada por um "✓" dentro da célula. Agora é uma grade de 7
// colunas com cabeçalho de dia da semana — o que torna a escolha por dia
// da semana ("todo domingo") possível de ler —, mês por extenso e seleção
// pela cor da marca com `accessibilityState.selected`, que é o idioma que
// o leitor de tela entende.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { SectionLabel } from "../components/SectionLabel";
import { describeLoadError } from "../lib/api/load-error";
import { getUnavailability, saveUnavailability } from "../lib/escala/escala-client";
import { formatMonthYear } from "../lib/format/date";
import { ChevronRight, Check } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import {
  ICON_STROKE_WIDTH,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from "../lib/theme/tokens";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Quantas células vazias entram antes do dia 1 para a grade alinhar por
 * dia da semana (0 = domingo, que é a primeira coluna). */
function leadingBlanks(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];

const SAVE_ERROR_MESSAGE = "Não foi possível salvar. Tente novamente.";

export default function IndisponibilidadeScreen() {
  const { primaryColor, colors } = useTheme();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
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
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setSelectedDays(new Set());
        // Erro visível — distingue "falha ao carregar" de "sem
        // indisponibilidade cadastrada" (tela vazia interpretável como
        // sem dado, mesmo princípio do Edge Case da spec para 403/lista
        // vazia).
        setLoadError(describeLoadError(err, "sua indisponibilidade").message);
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
    setSaving(true);
    try {
      await saveUnavailability(month, year, Array.from(selectedDays).sort(), notes.trim() || undefined);
      setSaved(true);
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  const total = daysInMonth(year, month);
  const days = Array.from({ length: total }, (_, i) => i + 1);
  const blanks = Array.from({ length: leadingBlanks(year, month) }, (_, i) => i);

  return (
    <Screen scroll>
      <Card>
        <View style={styles.monthRow}>
          <Pressable
            testID="prev-month"
            onPress={goToPreviousMonth}
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
            hitSlop={spacing.sm}
            style={styles.monthNav}
          >
            {/* Um só ícone, espelhado para "anterior": duas importações de
                chevron para o mesmo desenho não se pagam. */}
            <ChevronRight
              size={iconSize.action}
              color={colors.textSecondary}
              strokeWidth={ICON_STROKE_WIDTH}
              style={styles.flip}
            />
          </Pressable>
          <Text
            testID="current-month"
            style={[typography.h2, styles.monthLabel, { color: colors.textPrimary }]}
          >
            {formatMonthYear(month, year)}
          </Text>
          <Pressable
            testID="next-month"
            onPress={goToNextMonth}
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
            hitSlop={spacing.sm}
            style={styles.monthNav}
          >
            <ChevronRight
              size={iconSize.action}
              color={colors.textSecondary}
              strokeWidth={ICON_STROKE_WIDTH}
            />
          </Pressable>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAY_INITIALS.map((initial, index) => (
            <Text
              key={index}
              style={[typography.label, styles.weekday, { color: colors.textTertiary }]}
            >
              {initial}
            </Text>
          ))}
        </View>

        <View testID="days-grid" style={styles.daysGrid}>
          {blanks.map((blank) => (
            <View key={`blank-${blank}`} style={styles.dayCell} />
          ))}
          {days.map((day) => {
            const key = dayKey(year, month, day);
            const isSelected = selectedDays.has(key);
            return (
              <Pressable
                key={key}
                testID={`day-${key}`}
                onPress={() => toggleDay(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Dia ${day}${isSelected ? ", indisponível" : ""}`}
                style={styles.dayCell}
              >
                <View
                  style={[
                    styles.dayInner,
                    {
                      backgroundColor: isSelected ? primaryColor : colors.bgSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.bodyMedium,
                      { color: isSelected ? colors.textOnBrand : colors.textPrimary },
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View style={styles.notesSection}>
        <SectionLabel>Observação</SectionLabel>
        <Input
          testID="notes-input"
          placeholder="Ex.: viagem de trabalho (opcional)"
          value={notes}
          onChangeText={(text) => {
            setNotes(text);
            setSaved(false);
          }}
          multiline
        />
      </View>

      {loadError ? <Alert messageTestID="load-error" message={loadError} /> : null}
      {saveError ? <Alert messageTestID="save-error" message={saveError} /> : null}
      {saved ? (
        <Alert
          messageTestID="saved-message"
          message="Indisponibilidades salvas."
          tone="success"
          icon={Check}
        />
      ) : null}

      <AppButton testID="save-button" title="Salvar" loading={saving} onPress={handleSave} />
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
  monthNav: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  flip: { transform: [{ scaleX: -1 }] },
  monthLabel: {
    flex: 1,
    textAlign: "center",
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  weekday: {
    // 100/7 — a mesma fração da célula, para o cabeçalho ficar sobre a
    // coluna a que pertence.
    width: "14.28%",
    textAlign: "center",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  dayInner: {
    flex: 1,
    alignSelf: "stretch",
    borderRadius: radius.btn,
    alignItems: "center",
    justifyContent: "center",
  },
  notesSection: { marginTop: spacing.lg },
});
