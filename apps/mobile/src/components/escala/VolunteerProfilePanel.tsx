// "Meu perfil" de Minhas escalas (v2, `EscalasScreen` → aba perfil): o perfil
// de voluntário como a secretaria cadastrou — ministérios, habilidades — e o
// histórico de serviço. O voluntário edita só a própria disponibilidade
// semanal e aceita o termo de voluntariado (PROD-36); ministérios, habilidades
// e restrições seguem com a liderança (`volunteers/profiles`), e a tela diz isso.
//
// Carrega ao abrir a aba (o painel só monta quando ela é escolhida).
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { HttpError, NetworkError } from "../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { joinPt } from "../../lib/escala/availability";
import { acceptVolunteerTerm, getMyVolunteerProfile, updateMyAvailability } from "../../lib/escala/escala-client";
import type { MyVolunteerProfile } from "../../lib/escala/types";
import { formatLongDate, formatMonthYear } from "../../lib/format/date";
import {
  CalendarCheck,
  CircleAlert,
  FileText,
  Layers,
  ShieldCheck,
  Sparkles,
  UserCheck,
  WifiOff,
} from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, typography } from "../../lib/theme/tokens";
import { Alert } from "../Alert";
import { AppButton } from "../AppButton";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { ListGroup, type ListGroupItem } from "../ListGroup";
import { SectionLabel } from "../SectionLabel";

type State =
  | { kind: "loading" }
  | { kind: "ready"; profile: MyVolunteerProfile }
  | { kind: "missing" }
  | { kind: "error"; error: LoadErrorState };

function describeActionError(err: unknown, fallback: string): string {
  if (err instanceof NetworkError) return "Sem conexão. Verifique a internet e tente de novo.";
  if (err instanceof HttpError && err.status === 409 && !err.message.startsWith("HTTP ")) return err.message;
  return fallback;
}

function servedLabel(count: number): string {
  if (count === 0) return "Nenhuma escala servida ainda";
  return `${count} ${count === 1 ? "escala servida" : "escalas servidas"}`;
}

export function VolunteerProfilePanel() {
  const { colors } = useTheme();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<"availability" | "term" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function run(kind: "availability" | "term", action: () => Promise<MyVolunteerProfile>, fallback: string) {
    setBusy(kind);
    setActionError(null);
    setSaved(false);
    try {
      const profile = await action();
      setState({ kind: "ready", profile });
      setSaved(kind === "availability");
    } catch (err) {
      setActionError(describeActionError(err, fallback));
      // Termo trocado no servidor: recarrega para a pessoa ler a versão nova.
      if (err instanceof HttpError && (err.body as { code?: string } | null)?.code === "volunteer_term_outdated") {
        getMyVolunteerProfile()
          .then((profile) => setState({ kind: "ready", profile }))
          .catch(() => undefined);
      }
    } finally {
      setBusy(null);
    }
  }

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
      <View style={styles.section}>
        <SectionLabel>Disponibilidade semanal</SectionLabel>
      </View>
      <Text style={[typography.caption, styles.hint, { color: colors.textSecondary }]}>
        Toque nos turnos em que você pode servir. A liderança usa isso para montar as escalas.
      </Text>
      <AvailabilityEditor
        key={JSON.stringify(profile.availability)}
        value={profile.availability}
        saving={busy === "availability"}
        onSave={(next) =>
          run("availability", () => updateMyAvailability(next), "Não foi possível salvar. Tente de novo.")
        }
      />
      {saved ? (
        <View style={styles.feedback}>
          <Alert tone="success" messageTestID="disponibilidade-salva" message="Disponibilidade salva." />
        </View>
      ) : null}
      {actionError ? (
        <View style={styles.feedback}>
          <Alert messageTestID="perfil-acao-erro" message={actionError} />
        </View>
      ) : null}

      <View style={styles.group}>
        <ListGroup testID="perfil-servico" items={history} />
      </View>

      <View style={styles.section}>
        <SectionLabel>Termo de voluntariado</SectionLabel>
      </View>
      <View testID="perfil-termo" style={[styles.term, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
        <Text style={[typography.body, { color: colors.textPrimary }]}>{profile.term.text}</Text>
        <Text style={[typography.caption, styles.version, { color: colors.textTertiary }]}>
          Versão {profile.term.version}
        </Text>
        {profile.term.accepted_at ? (
          <View testID="perfil-termo-aceito" style={styles.accepted}>
            <ShieldCheck size={iconSize.inline} color={colors.success} strokeWidth={ICON_STROKE_WIDTH} />
            <Text style={[typography.bodyMedium, { color: colors.success }]}>
              {`Aceito em ${formatLongDate(profile.term.accepted_at) ?? "data não informada"}`}
            </Text>
          </View>
        ) : (
          <AppButton
            testID="perfil-termo-aceitar"
            title="Aceitar termo"
            icon={FileText}
            loading={busy === "term"}
            onPress={() =>
              run("term", () => acceptVolunteerTerm(profile.term.version), "Não foi possível registrar o aceite. Tente de novo.")
            }
          />
        )}
      </View>
      <Text style={[typography.caption, styles.note, { color: colors.textTertiary }]}>
        Ministérios, habilidades e restrições são cadastrados pela secretaria da igreja.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: spacing.lg },
  note: { marginTop: spacing.md, textAlign: "center" },
  section: { marginTop: spacing.xl },
  hint: { marginBottom: spacing.md },
  feedback: { marginTop: spacing.md },
  term: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing.lg },
  version: { marginTop: spacing.sm, marginBottom: spacing.lg },
  accepted: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  empty: { alignItems: "center", paddingVertical: spacing.xxxl },
  emptyTitle: { marginTop: spacing.lg, textAlign: "center" },
  emptyText: { marginTop: spacing.sm, textAlign: "center", maxWidth: 280 },
  retry: { marginTop: spacing.lg },
});
