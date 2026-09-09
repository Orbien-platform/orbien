// Tela de presença (MOB-09) — roster do grupo × quem já está marcado no
// encontro; líder seleciona quem mais esteve presente e confirma em lote.
// Só adiciona, nunca remove (Out of Scope da spec) — quem já tinha
// AttendanceRecord aparece marcado desde a abertura, sem opção de
// desmarcar.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";

import { getGroupRoster, getMeeting, recordAttendance } from "../../../../lib/pequenos-grupos/pequenos-grupos-client";
import type { GroupRosterMember } from "../../../../lib/pequenos-grupos/types";

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar o encontro. Verifique sua conexão.";
const SUBMIT_ERROR_MESSAGE = "Não foi possível registrar a presença. Tente novamente.";

export default function PresencaScreen() {
  const { id: meetingId } = useLocalSearchParams<{ id: string }>();
  const [roster, setRoster] = useState<GroupRosterMember[] | null>(null);
  const [alreadyMarked, setAlreadyMarked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getMeeting(meetingId)
      .then((meeting) =>
        getGroupRoster(meeting.small_group_id).then((members) => {
          if (cancelled) return;
          setRoster(members);
          setAlreadyMarked(new Set(meeting.attendanceRecords.map((a) => a.person_id)));
        }),
      )
      .catch(() => {
        if (cancelled) return;
        setLoadError(NETWORK_ERROR_MESSAGE);
      });

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  function toggle(personId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  async function handleConfirm() {
    if (submittingRef.current || selected.size === 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await recordAttendance(meetingId, Array.from(selected));
      setAlreadyMarked((current) => new Set([...current, ...selected]));
      setSelected(new Set());
    } catch {
      // Erro preserva a seleção (MOB-09-08) — não limpa `selected` aqui.
      setSubmitError(SUBMIT_ERROR_MESSAGE);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <View testID="presenca-error" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>{loadError}</Text>
      </View>
    );
  }

  return (
    <View testID="presenca-detail" style={{ flex: 1 }}>
      {submitError ? <Text testID="presenca-submit-error">{submitError}</Text> : null}
      <FlatList
        testID="presenca-roster"
        data={roster ?? []}
        keyExtractor={(item) => item.person_id}
        renderItem={({ item }) => {
          const isMarked = alreadyMarked.has(item.person_id);
          const isSelected = selected.has(item.person_id);
          return (
            <View testID={`roster-${item.person_id}`}>
              <Text>{item.full_name}</Text>
              {isMarked ? (
                <Text testID={`roster-${item.person_id}-marcado`}>Presente</Text>
              ) : (
                <Text
                  testID={`roster-${item.person_id}-toggle`}
                  onPress={() => toggle(item.person_id)}
                >
                  {isSelected ? "Selecionado" : "Marcar presença"}
                </Text>
              )}
            </View>
          );
        }}
      />
      <Text
        testID="presenca-confirmar"
        onPress={selected.size === 0 || submitting ? undefined : handleConfirm}
        accessibilityState={{ disabled: selected.size === 0 || submitting }}
      >
        Confirmar presença
      </Text>
    </View>
  );
}
