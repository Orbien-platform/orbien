// Inscrição em evento, do lado de quem se inscreve (`PROD-25`).
//
// É o par que faltava do `EventRegistrationsPanel` do web: lá é o painel do
// organizador (lista de nomes, inscreve visitante), aqui é o membro — e as
// duas telas batem em rotas diferentes de propósito. O membro só enxerga
// `.../registrations/summary` (vagas e prazo, sem nomes) e
// `.../registrations/me` (a própria inscrição); `GET .../registrations`
// responde 403 para ele, e não há chamada para essa rota neste arquivo.
//
// Componente próprio, e não um bloco em `app/post/[id].tsx`: a inscrição
// tem ciclo de vida próprio — recarrega sozinha depois de inscrever ou
// cancelar, sem recarregar o post.
//
// Visual conforme STYLE-GUIDE.md: `Card` do §7 como moldura, `Badge` com
// dot+texto para o status (§7 — cor sozinha não comunica), `AppButton` do
// §7 para as ações, e nenhum hex nem número solto — tudo de
// `lib/theme/tokens.ts`.
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";

import { Alert } from "./Alert";
import { AppButton } from "./AppButton";
import { Badge, type BadgeTone } from "./Badge";
import { Card } from "./Card";
import { SectionLabel } from "./SectionLabel";
import { HttpError } from "../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../lib/api/load-error";
import {
  cancelMyEventRegistration,
  getEventRegistrationSummary,
  getMyEventRegistration,
  isPaidRegistration,
  registerSelfForEvent,
} from "../lib/content/content-client";
import type {
  EventRegistrationPayment,
  EventRegistrationStatus,
  EventRegistrationSummary,
  MyEventRegistration,
} from "../lib/content/types";
import { formatBRL } from "../lib/format/currency";
import { formatDateTime } from "../lib/format/date";
import { CircleAlert, Copy, RefreshCw, Ticket, UserCheck, WifiOff } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, typography } from "../lib/theme/tokens";

const ACTION_ERROR = "Não foi possível concluir. Tente novamente.";

/** Rótulo e tom de cada status que o membro pode ter. `cancelled` não entra:
 * `GET .../registrations/me` só devolve `confirmed`, `waitlisted` e
 * `pending_payment` (o `MINE_VISIBLE` do service), e quem cancelou volta a
 * ver o botão de se inscrever. */
const STATUS: Record<string, { label: string; tone: BadgeTone; hint: string }> = {
  confirmed: {
    label: "Inscrição confirmada",
    tone: "success",
    hint: "Sua vaga está garantida.",
  },
  waitlisted: {
    label: "Na fila de espera",
    tone: "info",
    hint: "As vagas acabaram. Se alguém desistir, você entra automaticamente — pela ordem de chegada.",
  },
  pending_payment: {
    label: "Aguardando pagamento",
    tone: "neutral",
    hint: "Sua vaga fica reservada por 24 horas. Ela só é confirmada depois que o pagamento cair.",
  },
};

interface EventRegistrationPanelProps {
  postId: string;
}

export function EventRegistrationPanel({ postId }: EventRegistrationPanelProps) {
  const { colors } = useTheme();
  const [summary, setSummary] = useState<EventRegistrationSummary | null>(null);
  const [mine, setMine] = useState<MyEventRegistration | null>(null);
  // O QR só existe na resposta de `POST .../registrations/me` — `findMine`
  // devolve a inscrição, não o payload do PIX. Por isso ele mora em estado
  // de tela e some ao sair dela; a nota abaixo do QR diz ao usuário o que
  // fazer nesse caso (cancelar e se inscrever de novo gera outro).
  const [payment, setPayment] = useState<EventRegistrationPayment | null>(null);
  const [loadError, setLoadError] = useState<LoadErrorState | null>(null);
  // Incrementado por "Tentar novamente" — mesma mecânica de `presenca.tsx`.
  const [retryCount, setRetryCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Trava síncrona contra toque duplo: `submitting` só vale na renderização
  // seguinte, e dois POST seguidos aqui custam duas cobranças de PIX.
  const submittingRef = useRef(false);

  // As duas chamadas são independentes e o resumo é o que a tela precisa para
  // existir; a inscrição do usuário é o que ela acrescenta. Com `Promise.all`,
  // um 5xx em `.../me` apagava também preço, vagas e prazo, que já tinham
  // chegado — o mesmo erro que `handleRegister` evita logo abaixo com
  // `.catch(() => summary)`. Por isso `allSettled`: o resumo que voltou
  // renderiza, e só a metade que falhou some.
  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      getEventRegistrationSummary(postId),
      getMyEventRegistration(postId),
    ]).then(([summaryResult, mineResult]) => {
      if (cancelled) return;

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setLoadError(null);
      } else {
        setLoadError(describeLoadError(summaryResult.reason, "as inscrições"));
        return;
      }

      // `mine` que falhou não derruba a tela: o membro continua vendo vagas e
      // prazo, e a ausência de status é indistinguível de "não inscrito" — o
      // que a API corrige no próximo toque, recusando inscrição duplicada.
      setMine(mineResult.status === "fulfilled" ? (mineResult.value ?? null) : null);
    });

    return () => {
      cancelled = true;
    };
  }, [postId, retryCount]);

  /** Mensagem da API quando ela tem uma ("Vagas esgotadas para este
   * evento", "O prazo de inscrição para este evento já encerrou") — são
   * escritas para o usuário final e dizem mais que qualquer texto genérico
   * daqui. Erro de rede e 5xx caem no genérico. */
  function describeActionError(err: unknown): string {
    return err instanceof HttpError && err.status < 500 ? err.message : ACTION_ERROR;
  }

  async function handleRegister() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      const result = await registerSelfForEvent(postId);
      if (isPaidRegistration(result)) {
        setMine(result.registration);
        setPayment(result.payment);
      } else {
        setMine(result);
      }
      // A inscrição mudou a contagem de vagas — e, em evento lotado, o
      // status que acabou de voltar já reflete a fila. Recarrega o resumo,
      // sem derrubar o que acabou de ser mostrado se a releitura falhar.
      setSummary(await getEventRegistrationSummary(postId).catch(() => summary));
    } catch (err) {
      setActionError(describeActionError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      await cancelMyEventRegistration(postId);
      setMine(null);
      setPayment(null);
      setCopied(false);
      setSummary(await getEventRegistrationSummary(postId).catch(() => summary));
    } catch (err) {
      setActionError(describeActionError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!payment) return;
    // Sem isto, um retry bem-sucedido mostrava "Código copiado" ao lado do
    // alerta de falha da tentativa anterior.
    setActionError(null);
    try {
      await Clipboard.setStringAsync(payment.qr_code);
      setCopied(true);
    } catch {
      // Copiar é conveniência: o código continua em tela, selecionável.
      setActionError("Não foi possível copiar. Selecione o código abaixo do QR.");
    }
  }

  if (loadError) {
    return (
      <Card testID="event-registration-error">
        <Alert
          messageTestID="event-registration-load-error"
          message={loadError.message}
          icon={loadError.offline ? WifiOff : CircleAlert}
        />
        <Text style={[typography.bodyMedium, styles.line, { color: colors.textSecondary }]}>
          {loadError.description}
        </Text>
        <AppButton
          testID="event-registration-retry"
          title="Tentar novamente"
          icon={RefreshCw}
          variant="secondary"
          onPress={() => {
            setLoadError(null);
            setRetryCount((n) => n + 1);
          }}
        />
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card testID="event-registration-loading">
        <Text style={[typography.bodyMedium, { color: colors.textTertiary }]}>
          Carregando inscrições…
        </Text>
      </Card>
    );
  }

  // Inscrição desligada e o usuário sem nada nela: não há o que mostrar.
  // É o caso do evento que nunca abriu inscrição — e a razão de a tela poder
  // montar o painel para todo post de evento sem poluir os que não têm.
  if (!summary.registration_enabled && !mine) return null;

  const isPaid = summary.registration_price !== null && summary.registration_price > 0;
  const soldOut = summary.seats_left !== null && summary.seats_left === 0;
  // Evento pago lotado recusa a tentativa (400) — não há fila de espera
  // quando se cobra, porque cobrar por vaga incerta reabriria a pergunta de
  // reembolso, que o `PROD-24` não resolve. Gratuito lotado entra na fila,
  // então o botão continua valendo.
  const blocked = summary.registrations_closed || (isPaid && soldOut);
  const status = mine ? STATUS[mine.status as EventRegistrationStatus] : null;

  return (
    <View testID="event-registration">
      <SectionLabel>Inscrição</SectionLabel>

      <Card>
        <View style={styles.header}>
          <Ticket
            size={iconSize.action}
            color={colors.textSecondary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
          <Text
            testID="event-registration-price"
            style={[typography.h3, styles.flex, { color: colors.textPrimary }]}
          >
            {isPaid ? formatBRL(summary.registration_price as number) : "Inscrição gratuita"}
          </Text>
        </View>

        {/* Vagas e prazo: o que decide se ainda dá tempo. `seats_left` NULL
            é evento sem limite — dizer "vagas ilimitadas" seria ruído, então
            a linha simplesmente não aparece. */}
        {summary.seats_left !== null ? (
          <Text
            testID="event-registration-seats"
            style={[typography.bodyMedium, styles.line, { color: colors.textSecondary }]}
          >
            {summary.seats_left > 0
              ? `${summary.seats_left} ${summary.seats_left === 1 ? "vaga restante" : "vagas restantes"}`
              : "Vagas esgotadas"}
          </Text>
        ) : null}

        {summary.registration_deadline ? (
          <Text
            testID="event-registration-deadline"
            style={[typography.bodyMedium, styles.line, { color: colors.textSecondary }]}
          >
            {summary.registrations_closed ? "Inscrições encerradas em " : "Inscrições até "}
            {formatDateTime(summary.registration_deadline)}
          </Text>
        ) : null}

        {status ? (
          <>
            <Badge
              testID="event-registration-status"
              label={status.label}
              tone={status.tone}
              style={styles.badge}
            />
            <Text style={[typography.bodyMedium, styles.line, { color: colors.textSecondary }]}>
              {status.hint}
            </Text>
          </>
        ) : null}

        {payment ? (
          <View testID="event-registration-payment" style={styles.payment}>
            <Image
              testID="event-registration-qr"
              source={{ uri: `data:image/png;base64,${payment.qr_code_image}` }}
              style={styles.qr}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel="QR Code do PIX para pagar a inscrição"
            />
            <Text style={[typography.bodyMedium, styles.line, { color: colors.textSecondary }]}>
              Escaneie o QR no app do seu banco ou copie o código abaixo.
            </Text>
            <Text
              testID="event-registration-pix-code"
              selectable
              // Sem `numberOfLines`: truncar o payload entrega um código
              // inválido, e é justamente ele o fallback de quem não
              // conseguiu copiar.
              style={[typography.mono, styles.pixCode, { color: colors.textSecondary, backgroundColor: colors.bgSubtle }]}
            >
              {payment.qr_code}
            </Text>
            <AppButton
              testID="event-registration-copy"
              title={copied ? "Código copiado" : "Copiar código PIX"}
              icon={Copy}
              variant="secondary"
              onPress={handleCopy}
              style={styles.action}
            />
            <Text style={[typography.caption, styles.line, { color: colors.textTertiary }]}>
              Este código vale por 24 horas e só aparece aqui agora. Se você sair desta tela
              antes de pagar, cancele a inscrição e inscreva-se de novo para gerar outro.
            </Text>
          </View>
        ) : null}

        {actionError ? (
          <Alert messageTestID="event-registration-action-error" message={actionError} />
        ) : null}

        {mine ? (
          <AppButton
            testID="event-registration-cancel"
            title="Cancelar inscrição"
            variant="danger"
            loading={submitting}
            onPress={handleCancel}
            style={styles.action}
          />
        ) : blocked ? (
          <Text
            testID="event-registration-blocked"
            style={[typography.bodyMedium, styles.line, { color: colors.textTertiary }]}
          >
            {summary.registrations_closed
              ? "As inscrições para este evento estão encerradas."
              : "As vagas para este evento acabaram."}
          </Text>
        ) : (
          <AppButton
            testID="event-registration-submit"
            // Gratuito e lotado ainda aceita — entra na fila, e o botão diz
            // isso antes do toque em vez de surpreender com o resultado.
            title={soldOut ? "Entrar na fila de espera" : "Inscrever-se"}
            icon={UserCheck}
            loading={submitting}
            onPress={handleRegister}
            style={styles.action}
          />
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  flex: { flex: 1 },
  line: { marginBottom: spacing.sm },
  badge: { marginTop: spacing.sm, marginBottom: spacing.sm },
  action: { marginTop: spacing.sm },
  payment: {
    alignItems: "stretch",
    marginTop: spacing.md,
  },
  qr: {
    width: "100%",
    height: 200,
    marginBottom: spacing.md,
  },
  pixCode: {
    borderRadius: radius.btn,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
