// Tela "Dízimo automático" (PROD-28) — o próprio membro contrata, vê e
// cancela a assinatura PIX mensal. Rota solta, como `notificacoes.tsx`.
//
// **Não está disponível para ninguém ainda.** A entrada na Home só aparece
// com a trava `ASAAS_PAYMENTS_ENABLED` ligada na API e o tenant Premium; com
// a trava desligada, quem chegar aqui por deep link vê o aviso de
// indisponível — a não ser que já tenha uma assinatura, que continua
// visível e cancelável (cancelar nunca é barrado). Falta para lançar:
// `docs/PLANO.md`, PROD-28.
//
// O que a tela nunca faz: mostrar "cancelado" sem a API confirmar (a API só
// confirma depois da Asaas), nem contratar sem o aceite marcado.
import { useCallback, useEffect, useState } from "react";
import { Alert as NativeAlert, Pressable, StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { SectionLabel } from "../components/SectionLabel";
import { StatusMessage } from "../components/StatusMessage";
import { HttpError, NetworkError } from "../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../lib/api/load-error";
import { formatBRL } from "../lib/format/currency";
import { formatLongDate } from "../lib/format/date";
import {
  MAX_AMOUNT,
  MIN_AMOUNT,
  cancelMySubscription,
  createMySubscription,
  fetchAsaasPaymentsEnabled,
  listMySubscriptions,
  parseAmount,
  type DonorPixSubscription,
} from "../lib/pix-recorrente/pix-recorrente-client";
import { HandHeart, Square, SquareCheck, WifiOff } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, touchTarget, typography } from "../lib/theme/tokens";

/** Mensagem de falha de uma ação (contratar/cancelar). A API já responde em
 * português para os casos previstos (409, 403, 503, 400) — esses passam
 * direto; o resto vira texto genérico, sem número de status na tela. */
function describeActionError(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) return "Sem conexão. Verifique a internet e tente de novo.";
  if (error instanceof HttpError && [400, 403, 409, 503].includes(error.status)) {
    return error.message;
  }
  return fallback;
}

function fetchScreenData(): Promise<[DonorPixSubscription[], boolean]> {
  return Promise.all([listMySubscriptions(), fetchAsaasPaymentsEnabled()]);
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export default function DizimoAutomaticoScreen() {
  const { colors, brandInk } = useTheme();
  const [subscriptions, setSubscriptions] = useState<DonorPixSubscription[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loadError, setLoadError] = useState<LoadErrorState | null>(null);

  const [amountText, setAmountText] = useState("");
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applyLoaded = useCallback((list: DonorPixSubscription[], flag: boolean) => {
    setSubscriptions(list);
    setEnabled(flag);
    setLoadError(null);
  }, []);

  // Recarga depois de uma ação (contratar, cancelar, tentar de novo).
  const load = useCallback(async () => {
    try {
      const [list, flag] = await fetchScreenData();
      applyLoaded(list, flag);
    } catch (err) {
      setLoadError(describeLoadError(err, "seu dízimo automático"));
    }
  }, [applyLoaded]);

  // Carga inicial: estado só muda na resposta, e resposta que chega depois
  // de a tela desmontar é ignorada (mesmo padrão de `notificacoes.tsx`).
  useEffect(() => {
    const signal = { cancelled: false };
    fetchScreenData()
      .then(([list, flag]) => {
        if (!signal.cancelled) applyLoaded(list, flag);
      })
      .catch((err: unknown) => {
        if (!signal.cancelled) setLoadError(describeLoadError(err, "seu dízimo automático"));
      });
    return () => {
      signal.cancelled = true;
    };
  }, [applyLoaded]);

  const active = subscriptions?.find((s) => s.status === "active") ?? null;
  const amount = parseAmount(amountText);
  const amountInvalid =
    amountText.trim() !== "" && (amount === null || amount < MIN_AMOUNT || amount > MAX_AMOUNT);
  // O valor que o botão envia, ou `null` quando não pode enviar. Botão sem
  // valor não recebe `onPress` (mesmo padrão de `HomeQuickActions`): não há
  // um `if` dentro do handler que pudesse divergir do estado visual.
  const submitAmount =
    amount !== null && !amountInvalid && consented && !submitting ? amount : null;

  async function handleCreate(value: number) {
    setSubmitting(true);
    setActionError(null);
    setNotice(null);
    try {
      await createMySubscription(value);
      setAmountText("");
      setConsented(false);
      setNotice("Dízimo automático ativado.");
      await load();
    } catch (err) {
      setActionError(
        describeActionError(err, "Não foi possível ativar o dízimo automático. Tente de novo."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function confirmCancel(subscription: DonorPixSubscription) {
    NativeAlert.alert(
      "Cancelar dízimo automático?",
      "As próximas cobranças mensais param. O que já foi pago não é devolvido.",
      [
        { text: "Manter", style: "cancel" },
        {
          text: "Cancelar dízimo automático",
          style: "destructive",
          onPress: () => void handleCancel(subscription.id),
        },
      ],
    );
  }

  async function handleCancel(id: string) {
    setCancelling(true);
    setActionError(null);
    setNotice(null);
    try {
      await cancelMySubscription(id);
      setNotice("Dízimo automático cancelado.");
      await load();
    } catch (err) {
      // A API só marca cancelado depois da Asaas confirmar; falhou aqui, a
      // cobrança continua — e a tela tem que dizer isso, não o contrário.
      setActionError(
        describeActionError(
          err,
          "Não foi possível cancelar agora. Seu dízimo automático continua ativo — tente de novo.",
        ),
      );
    } finally {
      setCancelling(false);
    }
  }

  if (loadError) {
    return (
      <Screen center>
        <StatusMessage
          testID="dizimo-load-error"
          message={loadError.message}
          description={loadError.description}
          icon={loadError.offline ? WifiOff : undefined}
          tone="danger"
        >
          <AppButton testID="dizimo-retry" title="Tentar de novo" variant="secondary" onPress={load} />
        </StatusMessage>
      </Screen>
    );
  }

  if (subscriptions === null) return <Screen>{null}</Screen>;

  const banners = (
    <>
      {notice ? <Alert messageTestID="dizimo-notice" tone="success" message={notice} /> : null}
      {actionError ? <Alert messageTestID="dizimo-action-error" message={actionError} /> : null}
    </>
  );

  if (active) {
    const since = formatLongDate(active.created_at);
    return (
      <Screen scroll>
        {banners}
        <Card testID="dizimo-active">
          <View style={styles.activeHeader}>
            <Text style={[typography.label, { color: colors.textTertiary }]}>Valor mensal</Text>
            <Badge label="Ativo" tone="success" />
          </View>
          <Text testID="dizimo-amount" style={[typography.display, { color: colors.textPrimary }]}>
            {formatBRL(toNumber(active.amount))}
          </Text>
          <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
            Cobrança mensal via PIX{since ? `, desde ${since}` : ""}.
          </Text>
        </Card>

        <SectionLabel>Contribuições confirmadas</SectionLabel>
        <Card>
          {active.payments.length === 0 ? (
            <Text testID="dizimo-no-payments" style={[typography.bodyMedium, { color: colors.textSecondary }]}>
              A primeira contribuição aparece aqui quando o pagamento for confirmado.
            </Text>
          ) : (
            active.payments.map((payment, index) => (
              <View
                key={payment.id}
                style={[styles.paymentRow, index > 0 ? { borderTopColor: colors.border, borderTopWidth: 1 } : null]}
              >
                <Text style={[typography.bodyMedium, { color: colors.textPrimary }]}>
                  {(payment.paid_at && formatLongDate(payment.paid_at)) ?? "Data não informada"}
                </Text>
                <Text style={[typography.bodyMedium, { color: colors.textPrimary }]}>
                  {formatBRL(toNumber(payment.amount))}
                </Text>
              </View>
            ))
          )}
        </Card>

        <AppButton
          testID="dizimo-cancel"
          title="Cancelar dízimo automático"
          variant="danger"
          loading={cancelling}
          disabled={cancelling}
          onPress={() => confirmCancel(active)}
        />
      </Screen>
    );
  }

  if (!enabled) {
    return (
      <Screen center>
        {banners}
        <EmptyState
          testID="dizimo-unavailable"
          icon={HandHeart}
          title="Dízimo automático ainda não está disponível"
          description="Para contribuir agora, use Contribua na tela inicial."
        />
      </Screen>
    );
  }

  const ConsentIcon = consented ? SquareCheck : Square;

  return (
    <Screen scroll>
      {banners}
      <Card>
        <Text style={[typography.h3, { color: colors.textPrimary }]}>Contribua todo mês sem lembrar</Text>
        <Text style={[typography.body, styles.intro, { color: colors.textSecondary }]}>
          Escolha o valor do seu dízimo. A cobrança é mensal, via PIX, e você cancela quando quiser por
          esta tela.
        </Text>

        <Input
          testID="dizimo-amount-input"
          label="Valor mensal (R$)"
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          placeholder="Ex.: 150,00"
        />
        {amountInvalid ? (
          <Text testID="dizimo-amount-error" style={[typography.caption, { color: colors.danger }]}>
            Informe um valor entre {formatBRL(MIN_AMOUNT)} e {formatBRL(MAX_AMOUNT)}.
          </Text>
        ) : null}

        <Pressable
          testID="dizimo-consent"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consented }}
          onPress={() => setConsented((value) => !value)}
          style={styles.consentRow}
        >
          <ConsentIcon
            size={iconSize.action}
            color={consented ? brandInk : colors.textTertiary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
          <Text style={[typography.bodyMedium, styles.consentText, { color: colors.textPrimary }]}>
            Autorizo a cobrança mensal de{" "}
            {amount !== null && !amountInvalid ? formatBRL(amount) : "o valor acima"} via PIX para a minha
            igreja, até eu cancelar.
          </Text>
        </Pressable>

        <AppButton
          testID="dizimo-submit"
          title="Ativar dízimo automático"
          loading={submitting}
          disabled={submitAmount === null}
          onPress={submitAmount === null ? undefined : () => void handleCreate(submitAmount)}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  intro: { marginTop: spacing.xs, marginBottom: spacing.lg },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: touchTarget,
    marginVertical: spacing.md,
  },
  consentText: { flex: 1 },
});
