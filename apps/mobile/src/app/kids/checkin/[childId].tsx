// Kids — check-in do filho (T32, KIDS-08). Turma sugerida pela idade; fora da
// faixa, a turma que aceita pede confirmação e a que não aceita recusa com
// mensagem — a regra é da API (422), a tela só a conduz. Feito o check-in,
// segue para o código grande. A ação primária fica fixa no rodapé.
//
// As turmas vêm de `GET /kids/sessions/open`: as sessões abertas de HOJE, sem
// o app precisar saber o culto. Gestão e responsável veem todas.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Alert } from "../../../components/Alert";
import { AppButton } from "../../../components/AppButton";
import { Badge } from "../../../components/Badge";
import { Screen } from "../../../components/Screen";
import { SectionLabel } from "../../../components/SectionLabel";
import { StatusMessage } from "../../../components/StatusMessage";
import { AllergyNote } from "../../../components/kids/AllergyNote";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import {
  ageInMonths,
  checkInChild,
  describeKidsActionError,
  formatAge,
  getChild,
  isInRange,
  kidsErrorCode,
  listOpenSessions,
  suggestSession,
} from "../../../lib/kids/kids-client";
import type { KidsChildFicha, KidsGuardian, KidsOpenSession } from "../../../lib/kids/types";
import { getMyPersonId } from "../../../lib/privacidade/privacidade-client";
import { Baby, CircleAlert, CircleCheck, QrCode, WifiOff } from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, touchTarget, typography } from "../../../lib/theme/tokens";

interface Loaded {
  child: KidsChildFicha;
  sessions: KidsOpenSession[];
  myPersonId: string | null;
}

function rangeLabel(room: KidsOpenSession["room"]): string {
  return `${formatAge(room.min_age_months)} a ${formatAge(room.max_age_months)}`;
}

/** O culto da sessão: nome e, havendo, o horário. */
function sessionWhen(s: KidsOpenSession): string {
  const { celebration_name, start_time } = s.instance;
  return start_time ? `${celebration_name} às ${start_time}` : celebration_name;
}

export default function CheckinScreen() {
  const router = useRouter();
  const { colors, primaryColor } = useTheme();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [guardianId, setGuardianId] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      getChild(childId),
      listOpenSessions(),
      // O id da pessoa só escolhe quem entrega por padrão: sem ele, o
      // responsável principal assume.
      getMyPersonId().catch(() => null),
    ])
      .then(([child, sessions, myPersonId]) => {
        setData({ child, sessions, myPersonId });
        setError(null);
        const months = child.birth_date ? ageInMonths(child.birth_date) : null;
        const suggested = months === null ? null : suggestSession(sessions, months);
        setSessionId(suggested?.session_id ?? null);
        const mine = child.guardians.find((g) => g.guardian_person_id === myPersonId);
        const fallback = child.guardians.find((g) => g.is_primary) ?? child.guardians[0];
        setGuardianId((mine ?? fallback)?.guardian_person_id ?? null);
      })
      .catch((err: unknown) => setError(describeLoadError(err, "o check-in")));
  }, [childId]);

  useEffect(load, [load]);

  // O botão só existe habilitado com turma e quem entrega escolhidos, e fica
  // inerte enquanto carrega — por isso recebe os dois já resolvidos.
  async function submit(sessionId: string, guardianId: string, confirmOutOfRange: boolean) {
    setSubmitting(true);
    setMessage(null);
    try {
      await checkInChild(sessionId, {
        child_id: childId,
        guardian_person_id: guardianId,
        ...(confirmOutOfRange ? { confirm_out_of_range: true } : {}),
      });
      router.replace({ pathname: "/kids/codigo/[id]", params: { id: childId, feito: "1" } });
    } catch (err) {
      const code = kidsErrorCode(err);
      if (code === "OUT_OF_RANGE_CONFIRM") {
        setNeedsConfirm(true);
      } else if (code === "kids_out_of_range") {
        setNeedsConfirm(false);
        setMessage("Esta turma não aceita a idade da criança. Escolha outra turma.");
      } else {
        setMessage(describeKidsActionError(err, "Não foi possível fazer o check-in. Tente novamente."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <StatusMessage
        testID="checkin-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton testID="checkin-retry" title="Tentar de novo" variant="secondary" onPress={load} />
      </StatusMessage>
    );
  }

  if (!data) return <Screen>{null}</Screen>;

  const { child, sessions } = data;
  const open = sessions;
  const months = child.birth_date ? ageInMonths(child.birth_date) : null;
  const selected = open.find((s) => s.session_id === sessionId) ?? null;
  const suggestedId = months === null ? null : suggestSession(sessions, months)?.session_id;

  if (months === null) {
    return (
      <StatusMessage
        testID="checkin-sem-nascimento"
        icon={Baby}
        message="Falta a data de nascimento"
        description="Sem ela não dá para escolher a turma. Peça à secretaria para completar o cadastro."
      />
    );
  }

  if (open.length === 0) {
    return (
      <StatusMessage
        testID="checkin-sem-turma"
        icon={Baby}
        message="Hoje não há turma aberta."
        description="Procure o líder kids."
      />
    );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
        <Text style={[typography.h1, { color: colors.textPrimary }]}>{child.full_name}</Text>
        <Text style={[typography.body, styles.age, { color: colors.textSecondary }]}>{formatAge(months)}</Text>
        {child.allergies ? <AllergyNote testID="checkin-alergia" allergies={child.allergies} /> : null}

        {message ? <Alert messageTestID="checkin-message" message={message} /> : null}

        {needsConfirm && selected ? (
          <View testID="checkin-confirmar" style={[styles.confirm, { backgroundColor: colors.warningDim }]}>
            <Text style={[typography.h3, { color: colors.warning }]}>Fora da faixa da turma</Text>
            <Text style={[typography.body, { color: colors.warning }]}>
              {selected.room.name} recebe de {rangeLabel(selected.room)}. {child.full_name.split(" ")[0]} tem{" "}
              {formatAge(months)}. Fazer o check-in mesmo assim?
            </Text>
            <AppButton
              testID="checkin-confirmar-sim"
              title="Fazer check-in mesmo assim"
              loading={submitting}
              onPress={() => submit(selected.session_id, guardianId!, true)}
            />
            <AppButton
              testID="checkin-confirmar-nao"
              title="Escolher outra turma"
              variant="ghost"
              disabled={submitting}
              onPress={() => setNeedsConfirm(false)}
            />
          </View>
        ) : null}

        <SectionLabel>Turma</SectionLabel>
        {open.map((s) => {
          const active = s.session_id === sessionId;
          return (
            <Pressable
              key={s.session_id}
              testID={`checkin-turma-${s.session_id}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setSessionId(s.session_id);
                setNeedsConfirm(false);
                setMessage(null);
              }}
              style={[styles.row, { borderBottomColor: colors.border }]}
            >
              <View style={styles.rowText}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>{s.room.name}</Text>
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
                  {sessionWhen(s)} · {rangeLabel(s.room)}
                </Text>
              </View>
              {s.session_id === suggestedId && isInRange(s, months) ? <Badge label="Pela idade" tone="info" /> : null}
              {active ? (
                <CircleCheck size={iconSize.action} color={primaryColor} strokeWidth={ICON_STROKE_WIDTH} />
              ) : null}
            </Pressable>
          );
        })}

        {child.guardians.length > 1 ? (
          <>
            <SectionLabel>Quem entrega</SectionLabel>
            {child.guardians.map((g: KidsGuardian) => {
              const active = g.guardian_person_id === guardianId;
              return (
                <Pressable
                  key={g.id}
                  testID={`checkin-entrega-${g.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setGuardianId(g.guardian_person_id)}
                  style={[styles.row, { borderBottomColor: colors.border }]}
                >
                  <View style={styles.rowText}>
                    <Text style={[typography.h3, { color: colors.textPrimary }]}>{g.full_name}</Text>
                    <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>{g.relationship}</Text>
                  </View>
                  {active ? (
                    <CircleCheck size={iconSize.action} color={primaryColor} strokeWidth={ICON_STROKE_WIDTH} />
                  ) : null}
                </Pressable>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      <AppButton
        testID="checkin-fazer"
        title="Fazer check-in"
        disabled={!sessionId || !guardianId || needsConfirm}
        loading={submitting && !needsConfirm}
        onPress={() => submit(sessionId!, guardianId!, false)}
        style={styles.footer}
      />
      <AppButton
        testID="checkin-qr"
        title="Mostrar QR para o check-in"
        variant="secondary"
        icon={QrCode}
        disabled={submitting}
        onPress={() => router.push({ pathname: "/kids/qr/[childId]", params: { childId } })}
        style={styles.footer}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  age: { marginBottom: spacing.lg },
  confirm: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.card, marginVertical: spacing.md },
  row: {
    minHeight: touchTarget + spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  footer: { marginTop: spacing.md },
});
