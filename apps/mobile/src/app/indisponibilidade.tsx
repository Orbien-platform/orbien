// Tela Indisponibilidade (MOB-05, AC 4) — ver/editar datas indisponíveis
// do mês. Mesmo princípio de cancelamento de request obsoleta de
// apps/web/src/components/volunteers/UnavailabilityPanel.tsx: ao trocar
// de mês rápido, só a resposta do mês selecionado por último é aplicada.
import { useEffect, useState } from "react";
import { Button, Text, TextInput, View } from "react-native";

import { getUnavailability, saveUnavailability } from "../lib/escala/escala-client";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function IndisponibilidadeScreen() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Cancelamento evita que a resposta de um mês antigo (fora de ordem)
    // sobrescreva o mês selecionado por último.
    const signal = { cancelled: false };
    getUnavailability(month, year)
      .then((result) => {
        if (signal.cancelled) return;
        setSelectedDays(new Set((result?.dates ?? []).map((d) => d.date.slice(0, 10))));
        setSaved(false);
      })
      .catch(() => {
        if (signal.cancelled) return;
        setSelectedDays(new Set());
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
    await saveUnavailability(month, year, Array.from(selectedDays).sort(), notes.trim() || undefined);
    setSaved(true);
  }

  const total = daysInMonth(year, month);
  const days = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row" }}>
        <Button testID="prev-month" title="< Mês anterior" onPress={goToPreviousMonth} />
        <Text testID="current-month">{`${month}/${year}`}</Text>
        <Button testID="next-month" title="Próximo mês >" onPress={goToNextMonth} />
      </View>
      <View testID="days-grid" style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {days.map((day) => {
          const key = dayKey(year, month, day);
          return (
            <Button
              key={key}
              testID={`day-${key}`}
              title={selectedDays.has(key) ? `${day} ✓` : String(day)}
              onPress={() => toggleDay(day)}
            />
          );
        })}
      </View>
      <TextInput
        testID="notes-input"
        placeholder="Observação (opcional)"
        value={notes}
        onChangeText={(text) => {
          setNotes(text);
          setSaved(false);
        }}
      />
      {saved ? <Text testID="saved-message">Indisponibilidades salvas.</Text> : null}
      <Button testID="save-button" title="Salvar" onPress={handleSave} />
    </View>
  );
}
