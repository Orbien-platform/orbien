// Blocos do Início que mudam com o papel (PROD-30; `HomeApp` em
// docs/design/orbita-v2/produto/proto/app-shell.jsx):
//
// - encontro de hoje, com "Registrar presença" e "Mostrar QR" — quem lidera
//   um grupo (papel `leader` em `GET /small-groups/mine`);
// - celebração do domingo — `ministry_leader` e acima, os mesmos papéis que
//   a API aceita em `GET /celebrations/instances`;
// - próximas escalas com confirmar/recusar — área `volunteers`.
//
// O semáforo dos grupos (pastor, Premium) fica de fora: a API não expõe esse
// agregado ainda. Cada bloco busca o que precisa e some se a busca falha ou
// vem vazia — a Home não trava por causa de um bloco, como já é com "Meus
// grupos". O papel vem do token e a decisão é fail-closed; quem nega dado de
// verdade é a API.
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { listUpcomingInstances } from "../lib/celebracoes/celebracoes-client";
import type { CelebrationInstanceSummary } from "../lib/celebracoes/types";
import {
  getMyAssignments,
  respondToAssignment,
} from "../lib/escala/escala-client";
import type { Assignment } from "../lib/escala/types";
import { formatDayMonth, formatTime, localWhen } from "../lib/format/date";
import { listMeetings } from "../lib/pequenos-grupos/pequenos-grupos-client";
import type {
  GroupMeetingSummary,
  SmallGroupMine,
} from "../lib/pequenos-grupos/types";
import { CalendarOff, QrCode } from "../lib/theme/icons";
import { useGroupTerm } from "../lib/theme/terminology";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";
import { AppButton } from "./AppButton";
import { Badge } from "./Badge";
import { Card } from "./Card";
import { SectionLabel } from "./SectionLabel";

/** Quem lê a lista de celebrações da igreja — espelho do `@Roles` de
 * `GET /celebrations/instances`. */
export const CELEBRATION_ROLES = [
  "tenant_admin",
  "admin_congregation",
  "pastor",
  "secretary",
  "ministry_leader",
];

/** Mesmo dia no relógio do aparelho — `occurred_at` vem em ISO. */
function isToday(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

interface HomeRoleBlocksProps {
  roles: string[];
  groups: SmallGroupMine[] | null;
  /** `null` até `GET /me/permissions` responder; aí vale o fail-open da Mais. */
  areas: string[] | null;
}

export function HomeRoleBlocks({ roles, groups, areas }: HomeRoleBlocksProps) {
  const ledGroups = (groups ?? []).filter((g) => g.role === "leader");
  const showCelebration = roles.some((r) => CELEBRATION_ROLES.includes(r));
  const showAssignments = areas === null || areas.includes("volunteers");

  return (
    <>
      {ledGroups.length > 0 ? <TodayMeeting groups={ledGroups} /> : null}
      {showCelebration ? <SundayCelebration /> : null}
      {showAssignments ? <NextAssignments /> : null}
    </>
  );
}

function TodayMeeting({ groups }: { groups: SmallGroupMine[] }) {
  const router = useRouter();
  const { colors, primaryColor } = useTheme();
  const groupTerm = useGroupTerm();
  const [today, setToday] = useState<{
    group: SmallGroupMine;
    meeting: GroupMeetingSummary;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    Promise.all(
      groups.map((group) =>
        listMeetings(group.id).then(
          (meetings) => ({
            group,
            meeting: meetings.find((m) => isToday(m.occurred_at, now)),
          }),
          () => ({ group, meeting: undefined }),
        ),
      ),
    ).then((found) => {
      if (cancelled) return;
      const hit = found.find((f) => f.meeting);
      setToday(
        hit?.meeting ? { group: hit.group, meeting: hit.meeting } : null,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [groups]);

  if (!today) return null;
  const { group, meeting } = today;
  const time = formatTime(meeting.occurred_at);

  return (
    <View testID="home-today-meeting" style={styles.section}>
      <SectionLabel
        trailing={time ?? undefined}
      >{`Encontro de hoje`}</SectionLabel>
      <Card
        highlightColor={primaryColor}
        onPress={() => router.push(`/grupo/encontro/${meeting.id}`)}
        accessibilityLabel={`${groupTerm.singular} ${group.name}, encontro de hoje`}
      >
        <Text style={[typography.h3, { color: colors.textPrimary }]}>
          {group.name}
        </Text>
        {meeting.topic ? (
          <Text
            style={[
              typography.bodyMedium,
              styles.meta,
              { color: colors.textSecondary },
            ]}
          >
            {meeting.topic}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <AppButton
            testID="home-meeting-attendance"
            title="Registrar presença"
            onPress={() =>
              router.push(`/grupo/encontro/${meeting.id}/presenca`)
            }
            style={styles.grow}
          />
          <AppButton
            testID="home-meeting-qr"
            title="Mostrar QR"
            variant="secondary"
            icon={QrCode}
            onPress={() => router.push(`/grupo/encontro/${meeting.id}/qr`)}
            style={styles.grow}
          />
        </View>
      </Card>
    </View>
  );
}

function SundayCelebration() {
  const router = useRouter();
  const { colors } = useTheme();
  const [next, setNext] = useState<CelebrationInstanceSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    listUpcomingInstances()
      .then((list) => {
        if (cancelled) return;
        const sorted = [...list].sort((a, b) =>
          a.scheduled_date.localeCompare(b.scheduled_date),
        );
        setNext(sorted[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!next) return null;
  const when = localWhen(next.scheduled_date, next.celebration.start_time);
  const day = formatDayMonth(when);
  const time = formatTime(when);
  const order = next.serviceOrder;

  return (
    <View testID="home-celebration" style={styles.section}>
      <SectionLabel>Próxima celebração</SectionLabel>
      <Card
        onPress={() =>
          router.push(order ? `/celebracao/${order.id}` : "/celebracoes")
        }
        accessibilityLabel={next.celebration.name}
      >
        <Text style={[typography.h3, { color: colors.textPrimary }]}>
          {next.celebration.name}
        </Text>
        <Text
          style={[
            typography.bodyMedium,
            styles.meta,
            { color: colors.textSecondary },
          ]}
        >
          {[day ? `${day.day} ${day.month}` : null, time]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <View style={styles.badges}>
          <Badge
            label={
              order?.published_at ? "OC publicada" : "OC ainda não publicada"
            }
            tone={order?.published_at ? "success" : "neutral"}
          />
        </View>
      </Card>
    </View>
  );
}

function NextAssignments() {
  const router = useRouter();
  const { colors } = useTheme();
  const [next, setNext] = useState<Assignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyAssignments()
      .then((list) => {
        if (cancelled) return;
        const open = list.filter(
          (a) => a.status === "pending" || a.status === "confirmed",
        );
        open.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
        setNext(open[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const respond = useCallback(
    async (status: "confirmed" | "declined") => {
      if (!next || busy) return;
      setBusy(true);
      setFailed(false);
      try {
        const updated = await respondToAssignment(next.id, status);
        // Recusou: a escala sai da Home; confirmou: fica, já sem os botões.
        setNext(
          updated.status === "declined"
            ? null
            : { ...next, status: updated.status },
        );
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [next, busy],
  );

  if (!next) return null;
  const when = localWhen(next.scheduled_date, next.celebration.start_time);
  const day = formatDayMonth(when);
  const time = formatTime(when);
  const pending = next.status === "pending";

  return (
    <View testID="home-assignments" style={styles.section}>
      <SectionLabel>Minhas próximas escalas</SectionLabel>
      <Card
        onPress={() => router.push("/escala")}
        accessibilityLabel="Ver todas as escalas"
      >
        <View style={styles.row}>
          <View style={styles.date}>
            <Text style={[typography.label, { color: colors.textTertiary }]}>
              {day?.month}
            </Text>
            <Text style={[typography.h2, { color: colors.textPrimary }]}>
              {day?.day}
            </Text>
          </View>
          <View style={styles.grow}>
            <Text style={[typography.h3, { color: colors.textPrimary }]}>
              {next.ministry.name}
            </Text>
            <Text
              style={[typography.bodyMedium, { color: colors.textSecondary }]}
            >
              {[next.celebration.name, time].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Badge
            label={pending ? "Pendente" : "Confirmada"}
            tone={pending ? "neutral" : "success"}
          />
        </View>
      </Card>
      {pending ? (
        <View style={styles.actions}>
          <AppButton
            testID="home-assignment-confirm"
            title="Confirmar"
            loading={busy}
            onPress={() => respond("confirmed")}
            style={styles.grow}
          />
          <AppButton
            testID="home-assignment-decline"
            title="Recusar"
            variant="secondary"
            disabled={busy}
            onPress={() => respond("declined")}
            style={styles.grow}
          />
        </View>
      ) : null}
      {failed ? (
        <Text
          testID="home-assignment-error"
          style={[typography.caption, styles.meta, { color: colors.danger }]}
        >
          Não foi possível responder. Tente de novo.
        </Text>
      ) : null}
      <AppButton
        testID="home-unavailability"
        title="Informar indisponibilidade"
        variant="ghost"
        icon={CalendarOff}
        onPress={() => router.push("/indisponibilidade")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  grow: { flex: 1 },
  date: { alignItems: "center", minWidth: 44 },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  badges: { flexDirection: "row", marginTop: spacing.md },
  meta: { marginTop: spacing.xs },
});
