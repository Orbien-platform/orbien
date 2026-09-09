// Tela de presença (MOB-09) — roster do grupo × quem já está marcado no
// encontro; líder seleciona quem mais esteve presente e confirma em lote.
// Só adiciona, nunca remove (Out of Scope da spec) — quem já tinha
// AttendanceRecord aparece marcado desde a abertura, sem opção de
// desmarcar.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text } from "react-native";

import { AppButton } from "../../../../components/AppButton";
import { AppLink } from "../../../../components/AppLink";
import { Card } from "../../../../components/Card";
import { Screen } from "../../../../components/Screen";
import { StatusMessage } from "../../../../components/StatusMessage";
import { getGroupRoster, getMeeting, recordAttendance } from "../../../../lib/pequenos-grupos/pequenos-grupos-client";
import type { GroupRosterMember } from "../../../../lib/pequenos-grupos/types";
import { colors, spacing, typography } from "../../../../lib/theme/tokens";

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
  const [retryCount, setRetryCount] = useState(0);

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
  }, [meetingId, retryCount]);

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
      <StatusMessage testID="presenca-error" message={loadError} tone="danger">
        <AppLink
          testID="presenca-retry"
          onPress={() => {
            setLoadError(null);
            setRetryCount((n) => n + 1);
          }}
        >
          Tentar novamente
        </AppLink>
      </StatusMessage>
    );
  }

  return (
    <Screen testID="presenca-detail">
      {submitError ? (
        <Text testID="presenca-submit-error" style={styles.submitError}>
          {submitError}
        </Text>
      ) : null}
      <FlatList
        testID="presenca-roster"
        data={roster ?? []}
        keyExtractor={(item) => item.person_id}
        renderItem={({ item }) => {
          const isMarked = alreadyMarked.has(item.person_id);
          const isSelected = selected.has(item.person_id);
          return (
            <Card testID={`roster-${item.person_id}`} style={styles.rosterCard}>
              <Text style={typography.body}>{item.full_name}</Text>
              {isMarked ? (
                <Text testID={`roster-${item.person_id}-marcado`} style={styles.markedLabel}>
                  Presente
                </Text>
              ) : (
                <AppLink
                  testID={`roster-${item.person_id}-toggle`}
                  style={styles.toggleLink}
                  onPress={() => toggle(item.person_id)}
                >
                  {isSelected ? "Selecionado" : "Marcar presença"}
                </AppLink>
              )}
            </Card>
          );
        }}
      />
      <AppButton
        testID="presenca-confirmar"
        title="Confirmar presença"
        style={styles.confirmButton}
        disabled={selected.size === 0 || submitting}
        onPress={handleConfirm}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  submitError: {
    color: colors.danger,
    marginBottom: spacing.md,
  },
  rosterCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  markedLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
  },
  toggleLink: {
    fontSize: 14,
  },
  confirmButton: {
    marginTop: spacing.md,
  },
});
