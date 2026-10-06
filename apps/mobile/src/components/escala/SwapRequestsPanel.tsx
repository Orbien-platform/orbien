// "Trocas" de Minhas escalas (v2, `EscalasScreen` → aba trocas): os pedidos
// esperando a minha resposta e os que eu enviei.
//
// - Recebido dirigido a mim: Aceitar ou Recusar.
// - Recebido aberto ao ministério: só Aceitar — recusar não tem destinatário,
//   basta não aceitar (a API devolve 403 para isso).
// - Enviado em aberto: Cancelar.
//
// Aceitar passa a vaga: a escala de quem pediu vira "Trocado" e a minha nasce
// confirmada. Por isso toda ação bem-sucedida chama `onChanged`, que recarrega
// os pedidos e as escalas da tela.
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { HttpError } from "../../lib/api/errors";
import { respondToSwap } from "../../lib/escala/escala-client";
import type { MySwapRequests, SwapRequest, SwapRequestStatus } from "../../lib/escala/types";
import { formatDateTime, localWhen } from "../../lib/format/date";
import { ArrowLeftRight } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";
import { Alert } from "../Alert";
import { AppButton } from "../AppButton";
import { Avatar } from "../Avatar";
import { Badge, type BadgeTone } from "../Badge";
import { Card } from "../Card";
import { SectionLabel } from "../SectionLabel";

const STATUS_BADGE: Record<SwapRequestStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pendente", tone: "info" },
  accepted: { label: "Aceita", tone: "success" },
  declined: { label: "Recusada", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

type Action = "accept" | "decline" | "cancel";

const firstName = (fullName: string) => fullName.split(" ")[0];

/** "Mídia · dom, 31 mai · 09:30" */
export function describeSlot(req: SwapRequest): string {
  const when = formatDateTime(
    localWhen(req.assignment.scheduled_date, req.assignment.celebration.start_time),
  );
  return [req.assignment.ministry.name, when].filter(Boolean).join(" · ");
}

function outgoingStatus(req: SwapRequest): string {
  switch (req.status) {
    case "pending":
      return req.target ? `Aguardando ${req.target.full_name}` : "Aberto a todo o ministério";
    case "accepted":
      return `${req.accepted_by?.full_name ?? "Um colega"} assumiu`;
    case "declined":
      return `${req.target?.full_name ?? "O colega"} não pode`;
    default:
      return "Você cancelou";
  }
}

interface SwapRequestsPanelProps {
  swaps: MySwapRequests;
  onChanged: () => void;
}

export function SwapRequestsPanel({ swaps, onChanged }: SwapRequestsPanelProps) {
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  // Mesmo guarda de duplo toque da lista de escalas (ver escala.tsx).
  const busyRef = useRef<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, action: Action) {
    if (busyRef.current) return;
    busyRef.current = `${action}-${id}`;
    setBusy(busyRef.current);
    setError(null);
    try {
      await respondToSwap(id, action);
      onChanged();
    } catch (err) {
      if (err instanceof HttpError && (err.status === 409 || err.status === 422)) {
        // 409: outro colega aceitou, ou a escala mudou de estado; 422: a
        // escala voltou a rascunho ou já passou. Nos dois, a lista está velha.
        setError("Este pedido não está mais em aberto.");
        onChanged();
      } else if (err instanceof HttpError && err.status === 403 && action === "accept") {
        setError("Você não pode assumir esta escala: não serve no ministério ou já está nela.");
      } else {
        setError("Não foi possível concluir a ação. Tente novamente.");
      }
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }

  return (
    <ScrollView testID="trocas" showsVerticalScrollIndicator={false}>
      {error ? <Alert messageTestID="trocas-erro" message={error} /> : null}

      <SectionLabel trailing={swaps.incoming.length > 0 ? String(swaps.incoming.length) : undefined}>
        Pedidos para você
      </SectionLabel>
      {swaps.incoming.length === 0 ? (
        <Text testID="trocas-recebidas-vazio" style={[typography.body, styles.empty, { color: colors.textSecondary }]}>
          Nenhum pedido esperando sua resposta.
        </Text>
      ) : (
        swaps.incoming.map((req) => (
          <Card key={req.id} testID={`troca-recebida-${req.id}`} style={styles.card}>
            <View style={styles.row}>
              <Avatar name={req.requester.full_name} />
              <View style={styles.body}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>
                  {firstName(req.requester.full_name)} pediu para trocar
                </Text>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>
                  {describeSlot(req)}
                </Text>
                {req.target ? null : (
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>
                    Aberto a todo o ministério
                  </Text>
                )}
              </View>
            </View>
            {req.message ? (
              <Text style={[typography.body, styles.message, { color: colors.textSecondary }]}>
                “{req.message}”
              </Text>
            ) : null}
            <View style={styles.actions}>
              <AppButton
                testID={`troca-aceitar-${req.id}`}
                title="Aceitar"
                loading={busy === `accept-${req.id}`}
                disabled={busy !== null}
                onPress={() => act(req.id, "accept")}
                style={styles.action}
              />
              {req.target ? (
                <AppButton
                  testID={`troca-recusar-${req.id}`}
                  title="Recusar"
                  variant="secondary"
                  loading={busy === `decline-${req.id}`}
                  disabled={busy !== null}
                  onPress={() => act(req.id, "decline")}
                  style={styles.action}
                />
              ) : null}
            </View>
          </Card>
        ))
      )}

      <View style={styles.section}>
        <SectionLabel>Enviados</SectionLabel>
      </View>
      {swaps.outgoing.length === 0 ? (
        <Text testID="trocas-enviadas-vazio" style={[typography.body, styles.empty, { color: colors.textSecondary }]}>
          Para pedir troca, toque em “Pedir troca” numa escala de Próximas.
        </Text>
      ) : (
        swaps.outgoing.map((req) => (
          <Card key={req.id} testID={`troca-enviada-${req.id}`} style={styles.card}>
            <View style={styles.row}>
              <ArrowLeftRight
                size={iconSize.inline}
                color={colors.textTertiary}
                strokeWidth={ICON_STROKE_WIDTH}
              />
              <View style={styles.body}>
                <Text style={[typography.h3, { color: colors.textPrimary }]}>{describeSlot(req)}</Text>
                <Text style={[typography.caption, { color: colors.textTertiary }]}>
                  {outgoingStatus(req)}
                </Text>
              </View>
              <Badge testID={`troca-enviada-${req.id}-status`} {...STATUS_BADGE[req.status]} />
            </View>
            {req.status === "pending" ? (
              <AppButton
                testID={`troca-cancelar-${req.id}`}
                title="Cancelar pedido"
                variant="ghost"
                loading={busy === `cancel-${req.id}`}
                disabled={busy !== null}
                onPress={() => act(req.id, "cancel")}
                style={styles.cancel}
              />
            ) : null}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  body: { flex: 1 },
  message: { marginTop: spacing.md },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  action: { flex: 1 },
  cancel: { marginTop: spacing.sm },
  section: { marginTop: spacing.xl },
  empty: { paddingVertical: spacing.md },
});
