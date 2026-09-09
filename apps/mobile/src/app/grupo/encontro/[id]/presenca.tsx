// Tela de presença (MOB-09) — roster do grupo × quem já está marcado no
// encontro; líder seleciona quem mais esteve presente e confirma em lote.
// Só adiciona, nunca remove (Out of Scope da spec) — quem já tinha
// AttendanceRecord aparece marcado desde a abertura, sem opção de
// desmarcar.
//
// Visual conforme STYLE-GUIDE.md: a linha vira o card de lista do §7 com
// avatar de iniciais e checkbox, e o alvo de toque passa a ser o card
// inteiro em vez do texto "Marcar presença" (~20px de alto, contra os 48
// do §3) — marcar dez pessoas era dez toques de precisão. O texto do
// estado continua em tela, ao lado do checkbox, porque é ele que diz o que
// vai acontecer ao confirmar.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Alert } from "../../../../components/Alert";
import { AppButton } from "../../../../components/AppButton";
import { Avatar } from "../../../../components/Avatar";
import { Card } from "../../../../components/Card";
import { Screen } from "../../../../components/Screen";
import { SectionLabel } from "../../../../components/SectionLabel";
import { StatusMessage } from "../../../../components/StatusMessage";
import {
  getGroupRoster,
  getMeeting,
  recordAttendance,
} from "../../../../lib/pequenos-grupos/pequenos-grupos-client";
import type { GroupRosterMember } from "../../../../lib/pequenos-grupos/types";
import {
  CircleCheck,
  RefreshCw,
  Square,
  SquareCheck,
  WifiOff,
} from "../../../../lib/theme/icons";
import { useTheme } from "../../../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../../../lib/theme/tokens";

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar o encontro. Verifique sua conexão.";
const SUBMIT_ERROR_MESSAGE = "Não foi possível registrar a presença. Tente novamente.";

export default function PresencaScreen() {
  const { id: meetingId } = useLocalSearchParams<{ id: string }>();
  const { primaryColor, colors } = useTheme();
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
      <StatusMessage testID="presenca-error" icon={WifiOff} message={loadError} tone="danger">
        <AppButton
          testID="presenca-retry"
          title="Tentar novamente"
          icon={RefreshCw}
          variant="secondary"
          onPress={() => {
            setLoadError(null);
            setRetryCount((n) => n + 1);
          }}
        />
      </StatusMessage>
    );
  }

  const totalPresent = alreadyMarked.size + selected.size;

  return (
    <Screen testID="presenca-detail">
      {submitError ? (
        <Alert messageTestID="presenca-submit-error" message={submitError} />
      ) : null}

      <FlatList
        testID="presenca-roster"
        data={roster ?? []}
        keyExtractor={(item) => item.person_id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          roster && roster.length > 0 ? (
            <SectionLabel trailing={`${totalPresent}/${roster.length}`}>Presentes</SectionLabel>
          ) : null
        }
        renderItem={({ item }) => {
          const isMarked = alreadyMarked.has(item.person_id);
          const isSelected = selected.has(item.person_id);

          return (
            <Card
              testID={`roster-${item.person_id}`}
              // Já marcado não é tocável: a spec não permite desmarcar.
              onPress={isMarked ? undefined : () => toggle(item.person_id)}
              accessibilityLabel={`${item.full_name}${isMarked ? " — presente" : ""}`}
              style={styles.rosterCard}
            >
              <View style={styles.rosterRow}>
                <Avatar
                  name={item.full_name}
                  background={isMarked || isSelected ? primaryColor : undefined}
                  foreground={isMarked || isSelected ? colors.textOnBrand : undefined}
                />
                <Text style={[typography.h3, styles.name, { color: colors.textPrimary }]}>
                  {item.full_name}
                </Text>

                {isMarked ? (
                  <View style={styles.stateRow}>
                    <CircleCheck
                      size={iconSize.action}
                      color={colors.success}
                      strokeWidth={ICON_STROKE_WIDTH}
                    />
                    <Text
                      testID={`roster-${item.person_id}-marcado`}
                      style={[typography.label, { color: colors.success }]}
                    >
                      Presente
                    </Text>
                  </View>
                ) : (
                  // O testID fica na View, não num Pressable próprio: quem
                  // recebe o toque é o card inteiro (§7). O teste desta
                  // tela lê o texto daqui ("Selecionado"/"Marcar
                  // presença"), que continua sendo o estado visível.
                  <View
                    testID={`roster-${item.person_id}-toggle`}
                    accessibilityState={{ checked: isSelected }}
                    style={styles.stateRow}
                  >
                    {isSelected ? (
                      <SquareCheck
                        size={iconSize.action}
                        color={primaryColor}
                        strokeWidth={ICON_STROKE_WIDTH}
                      />
                    ) : (
                      <Square
                        size={iconSize.action}
                        color={colors.textTertiary}
                        strokeWidth={ICON_STROKE_WIDTH}
                      />
                    )}
                    <Text
                      style={[
                        typography.label,
                        { color: isSelected ? primaryColor : colors.textTertiary },
                      ]}
                    >
                      {isSelected ? "Selecionado" : "Marcar presença"}
                    </Text>
                  </View>
                )}
              </View>
            </Card>
          );
        }}
      />

      <AppButton
        testID="presenca-confirmar"
        title={
          selected.size > 0 ? `Confirmar presença (${selected.size})` : "Confirmar presença"
        }
        icon={CircleCheck}
        style={styles.confirmButton}
        disabled={selected.size === 0}
        loading={submitting}
        onPress={handleConfirm}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rosterCard: { marginBottom: spacing.sm },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  name: { flex: 1 },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  confirmButton: { marginTop: spacing.md },
});
