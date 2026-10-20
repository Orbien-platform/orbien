// Tela de encontros do grupo (MOB-09) — rota-filha do Stack raiz (fora de
// (tabs)), mesmo critério de post/[id].tsx e indisponibilidade.tsx. Lista
// os encontros do grupo, mais recente primeiro; toque num encontro leva ao
// material (`/grupo/encontro/[id]`).
//
// Visual conforme STYLE-GUIDE.md: o card mostrava `item.topic ??
// item.occurred_at` — sem tópico, o usuário via a data ISO crua
// ("2026-09-13T19:00:00.000Z"). Agora a data vem formatada em pt-BR
// (src/lib/format/date.ts) como bloco à esquerda do card (§7), e o tópico
// fica no título, com um rótulo neutro quando não há.
//
// PROD-38: acima dos encontros, os materiais que chegam ao grupo por rede ou
// por alcance direto (`GET /small-groups/:id/materials`). Falhar aqui não derruba
// a tela: os encontros carregam por conta própria e a falha vira um aviso.
//
// PROD-12: acima da lista, "Fazer check-in" abre o leitor do QR do líder.
// Não aparece para quem lidera o grupo (`role` vem da aba, de
// `GET /small-groups/mine`) — o líder mostra o QR a partir do encontro.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Linking, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../components/AppButton";
import { AppLink } from "../../components/AppLink";
import { Card } from "../../components/Card";
import { DateBlock } from "../../components/DateBlock";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { StatusMessage } from "../../components/StatusMessage";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { listGroupMaterials, listMeetings } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { GroupMaterial, GroupMeetingSummary } from "../../lib/pequenos-grupos/types";
import { formatDateTime } from "../../lib/format/date";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  Lock,
  RefreshCw,
  ScanLine,
  WifiOff,
} from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

function MaterialCard({ material, now }: { material: GroupMaterial; now: number }) {
  const { colors } = useTheme();
  const isRichText = material.source_type === "rich_text";
  const Icon = isRichText ? BookOpen : FileText;
  const releasesAt = new Date(material.publish_at).getTime() > now;
  const when = formatDateTime(material.publish_at);

  return (
    <Card testID={`grupo-material-${material.id}`}>
      <View style={styles.cardRow}>
        <Icon size={iconSize.action} color={colors.textSecondary} strokeWidth={ICON_STROKE_WIDTH} />
        <View style={styles.cardBody}>
          <Text style={[typography.h3, { color: colors.textPrimary }]}>{material.title}</Text>
          {releasesAt && when ? (
            <Text style={[typography.caption, styles.when, { color: colors.textTertiary }]}>
              Libera em {when}
            </Text>
          ) : null}
          {material.visibility === "leaders_only" ? (
            <View style={styles.leadersOnly}>
              <Lock size={iconSize.inline} color={colors.textTertiary} strokeWidth={ICON_STROKE_WIDTH} />
              <Text style={[typography.caption, { color: colors.textTertiary }]}>Somente líderes</Text>
            </View>
          ) : null}
        </View>
      </View>
      {isRichText ? (
        <Text
          testID={`grupo-material-${material.id}-rich-content`}
          style={[typography.body, styles.richContent, { color: colors.textSecondary }]}
        >
          {material.rich_content}
        </Text>
      ) : (
        <AppLink
          testID={`grupo-material-${material.id}-abrir`}
          icon={ExternalLink}
          disabled={!material.file_url}
          onPress={
            material.file_url ? () => Linking.openURL(material.file_url as string) : undefined
          }
        >
          Abrir
        </AppLink>
      )}
    </Card>
  );
}

const EMPTY_MESSAGE = "Nenhum encontro registrado.";

export default function GrupoScreen() {
  const { id, role } = useLocalSearchParams<{ id: string; role?: string }>();
  const router = useRouter();
  const { colors, brandInk } = useTheme();
  const [meetings, setMeetings] = useState<GroupMeetingSummary[] | null>(null);
  // Instante em que a tela abriu: decide "libera em" x já liberado.
  const [now] = useState(() => Date.now());
  const [materials, setMaterials] = useState<GroupMaterial[]>([]);
  const [materialsFailed, setMaterialsFailed] = useState(false);
  const [error, setError] = useState<LoadErrorState | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    listMeetings(id)
      .then((result) => {
        if (cancelled) return;
        const sorted = [...result].sort(
          (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        );
        setMeetings(sorted);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeLoadError(err, "os encontros"));
      });

    listGroupMaterials(id)
      .then((result) => {
        if (cancelled) return;
        setMaterials(result);
        setMaterialsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMaterials([]);
        setMaterialsFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id, retryCount]);

  if (error) {
    return (
      <StatusMessage
        testID="grupo-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton
          testID="grupo-retry"
          title="Tentar novamente"
          icon={RefreshCw}
          variant="secondary"
          onPress={() => {
            setError(null);
            setRetryCount((n) => n + 1);
          }}
        />
      </StatusMessage>
    );
  }

  if (meetings && meetings.length === 0 && materials.length === 0) {
    return (
      <StatusMessage
        testID="grupo-empty"
        icon={CalendarDays}
        message={EMPTY_MESSAGE}
        description="Os encontros do grupo aparecem aqui quando forem registrados."
      />
    );
  }

  return (
    <Screen>
      <FlatList
        testID="grupo-meetings-list"
        data={meetings ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          meetings ? (
            <>
              {meetings.length > 0 && role !== "leader" ? (
                <Card
                  testID="grupo-fazer-checkin"
                  onPress={() => router.push("/checkin")}
                  accessibilityLabel="Fazer check-in"
                  style={styles.checkin}
                >
                  <View style={styles.cardRow}>
                    <ScanLine
                      size={iconSize.action}
                      color={brandInk}
                      strokeWidth={ICON_STROKE_WIDTH}
                    />
                    <View style={styles.cardBody}>
                      <Text style={[typography.h3, { color: colors.textPrimary }]}>
                        Fazer check-in
                      </Text>
                      <Text
                        style={[typography.caption, styles.when, { color: colors.textTertiary }]}
                      >
                        Leia o QR que o líder mostra no encontro
                      </Text>
                    </View>
                    <ChevronRight
                      size={iconSize.inline}
                      color={colors.textTertiary}
                      strokeWidth={ICON_STROKE_WIDTH}
                    />
                  </View>
                </Card>
              ) : null}
              {materials.length > 0 ? (
                <View testID="grupo-materials" style={styles.materials}>
                  <SectionLabel trailing={String(materials.length)}>Materiais</SectionLabel>
                  {materials.map((m) => (
                    <MaterialCard key={m.id} material={m} now={now} />
                  ))}
                </View>
              ) : null}
              {materialsFailed ? (
                <Text
                  testID="grupo-materials-error"
                  style={[typography.caption, styles.materialsError, { color: colors.danger }]}
                >
                  Não foi possível carregar os materiais do grupo.
                </Text>
              ) : null}
              {meetings.length > 0 ? (
                <SectionLabel trailing={String(meetings.length)}>Encontros</SectionLabel>
              ) : null}
            </>
          ) : null
        }
        renderItem={({ item }) => {
          const when = formatDateTime(item.occurred_at);
          return (
            <Card
              testID={`encontro-${item.id}`}
              onPress={() => router.push(`/grupo/encontro/${item.id}`)}
              accessibilityLabel={item.topic ?? when ?? "Encontro"}
            >
              <View style={styles.cardRow}>
                <DateBlock iso={item.occurred_at} />
                <View style={styles.cardBody}>
                  <Text style={[typography.h3, { color: colors.textPrimary }]}>
                    {item.topic ?? "Encontro"}
                  </Text>
                  {when ? (
                    <Text style={[typography.caption, styles.when, { color: colors.textTertiary }]}>
                      {when}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight
                  size={iconSize.inline}
                  color={colors.textTertiary}
                  strokeWidth={ICON_STROKE_WIDTH}
                />
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardBody: { flex: 1 },
  when: { marginTop: spacing.xs },
  checkin: { marginBottom: spacing.lg },
  materials: { marginBottom: spacing.lg },
  materialsError: { marginBottom: spacing.lg },
  leadersOnly: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  richContent: { marginTop: spacing.md },
});
