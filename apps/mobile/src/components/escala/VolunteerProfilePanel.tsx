// "Meu perfil" de Minhas escalas (v2, `EscalasScreen` → aba perfil): o perfil
// de voluntário como a secretaria cadastrou — ministérios, habilidades,
// disponibilidade semanal — e o histórico de serviço. Leitura só: quem edita
// o perfil é a secretaria (`volunteers/profiles`), e a tela diz isso.
//
// Carrega ao abrir a aba (o painel só monta quando ela é escolhida).
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { HttpError } from "../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { formatWeeklyAvailability, joinPt } from "../../lib/escala/availability";
import { getMyVolunteerProfile } from "../../lib/escala/escala-client";
import type { MyVolunteerProfile } from "../../lib/escala/types";
import { formatMonthYear } from "../../lib/format/date";
import {
  CalendarCheck,
  CircleAlert,
  Clock,
  Layers,
  Sparkles,
  UserCheck,
  WifiOff,
} from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";
import { AppButton } from "../AppButton";
import { ListGroup, type ListGroupItem } from "../ListGroup";
import { SectionLabel } from "../SectionLabel";

type State =
  | { kind: "loading" }
  | { kind: "ready"; profile: MyVolunteerProfile }
  | { kind: "missing" }
  | { kind: "error"; error: LoadErrorState };

function servedLabel(count: number): string {
  if (count === 0) return "Nenhuma escala servida ainda";
  return `${count} ${count === 1 ? "escala servida" : "escalas servidas"}`;
}

export function VolunteerProfilePanel() {
  const { colors } = useTheme();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMyVolunteerProfile()
      .then((profile) => {
        if (!cancelled) setState({ kind: "ready", profile });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof HttpError && err.status === 404) {
          setState({ kind: "missing" });
        } else {
          setState({ kind: "error", error: describeLoadError(err, "seu perfil de voluntário") });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.kind === "loading") return null;

  if (state.kind !== "ready") {
    const missing = state.kind === "missing";
    const Icon = missing ? UserCheck : state.error.offline ? WifiOff : CircleAlert;
    return (
      <View testID={missing ? "perfil-voluntario-ausente" : "perfil-voluntario-erro"} style={styles.empty}>
        <Icon size={iconSize.emphasis} color={colors.textTertiary} strokeWidth={ICON_STROKE_WIDTH} />
        <Text style={[typography.h3, styles.emptyTitle, { color: colors.textPrimary }]}>
          {missing ? "Você ainda não tem perfil de voluntário" : state.error.message}
        </Text>
        <Text style={[typography.body, styles.emptyText, { color: colors.textSecondary }]}>
          {missing
            ? "Peça à liderança do seu ministério para cadastrar você."
            : state.error.description}
        </Text>
        {missing ? null : (
          <AppButton
            testID="perfil-voluntario-tentar"
            title="Tentar de novo"
            variant="secondary"
            onPress={() => {
              setState({ kind: "loading" });
              setAttempt((n) => n + 1);
            }}
            style={styles.retry}
          />
        )}
      </View>
    );
  }

  const { profile } = state;
  const since = new Date(profile.volunteer_since);
  const ministries = profile.ministries.map((m) =>
    m.role === "leader" ? `${m.name} (líder)` : m.name,
  );

  const about: ListGroupItem[] = [
    {
      key: "ministerios",
      testID: "perfil-ministerios",
      label: "Ministérios",
      sub: ministries.length > 0 ? joinPt(ministries) : "Nenhum ainda",
      icon: Layers,
    },
    {
      key: "habilidades",
      testID: "perfil-habilidades",
      label: "Habilidades",
      sub: profile.skills.length > 0 ? joinPt(profile.skills) : "Nenhuma informada",
      icon: Sparkles,
    },
    {
      key: "disponibilidade",
      testID: "perfil-disponibilidade",
      label: "Disponibilidade semanal",
      sub: formatWeeklyAvailability(profile.availability) ?? "Não informada",
      icon: Clock,
    },
    ...(profile.restrictions
      ? [
          {
            key: "restricoes",
            testID: "perfil-restricoes",
            label: "Restrições",
            sub: profile.restrictions,
            icon: CircleAlert,
          },
        ]
      : []),
  ];

  const history: ListGroupItem[] = [
    {
      key: "historico",
      testID: "perfil-historico",
      label: "Histórico de serviço",
      sub: `${servedLabel(profile.served_count)}, desde ${formatMonthYear(
        since.getMonth() + 1,
        since.getFullYear(),
      ).toLowerCase()}`,
      icon: CalendarCheck,
    },
  ];

  return (
    <ScrollView testID="perfil-voluntario" showsVerticalScrollIndicator={false}>
      <SectionLabel>Meu perfil de voluntário</SectionLabel>
      <ListGroup testID="perfil-sobre" items={about} />
      <View style={styles.group}>
        <ListGroup testID="perfil-servico" items={history} />
      </View>
      <Text style={[typography.caption, styles.note, { color: colors.textTertiary }]}>
        Para mudar o perfil, fale com a secretaria da igreja.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: spacing.lg },
  note: { marginTop: spacing.md, textAlign: "center" },
  empty: { alignItems: "center", paddingVertical: spacing.xxxl },
  emptyTitle: { marginTop: spacing.lg, textAlign: "center" },
  emptyText: { marginTop: spacing.sm, textAlign: "center", maxWidth: 280 },
  retry: { marginTop: spacing.lg },
});
