// Kids — QR do responsável para o check-in (MOB-1, KIDS-08). O responsável
// mostra o QR à equipe, que o lê na turma; quem decide faixa, consentimento e
// capacidade é a API, igual ao check-in manual. O QR vale 5 minutos e uma
// leitura: a tela conta o tempo, esconde o QR quando acaba e oferece outro.
//
// A placa do QR é branca nos dois modos (`QrCode`), então o contraste não
// depende do tema; brilho no máximo e tela acesa vêm de `usePresentationMode`.
// Depois da leitura, o check-in aparece em `GET /kids/children/:id/checkin`:
// a tela consulta de tempos em tempos e leva ao código de retirada.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { AppButton } from "../../../components/AppButton";
import { QrCode } from "../../../components/QrCode";
import { Screen, useScreenPadding } from "../../../components/Screen";
import { StatusMessage } from "../../../components/StatusMessage";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import { HttpError } from "../../../lib/api/errors";
import {
  describeKidsActionError,
  formatCountdown,
  getOpenCheckin,
  issueCheckinQr,
} from "../../../lib/kids/kids-client";
import type { KidsCheckinQr } from "../../../lib/kids/types";
import { usePresentationMode } from "../../../lib/qr/use-presentation-mode";
import { Baby, CircleAlert, CircleCheck, Clock, RefreshCw, WifiOff } from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { qr, radius, spacing, typography } from "../../../lib/theme/tokens";

/** De quanto em quanto tempo a tela confere se a equipe já leu o QR. */
export const USED_POLL_MS = 4000;

type Phase = "loading" | "ready" | "expired" | "used" | "refused" | "error";

export default function QrCheckinScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { width } = useWindowDimensions();
  const horizontal = useScreenPadding();
  usePresentationMode();

  const [phase, setPhase] = useState<Phase>("loading");
  const [issued, setIssued] = useState<KidsCheckinQr | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);

  const issue = useCallback(() => {
    issueCheckinQr(childId)
      .then((result) => {
        setIssued(result);
        setRemaining(new Date(result.expires_at).getTime() - Date.now());
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof HttpError && err.status === 409) {
          setRefusal(describeKidsActionError(err, "Este filho já está na turma."));
          setPhase("refused");
        } else {
          setError(describeLoadError(err, "o QR de check-in"));
          setPhase("error");
        }
      });
  }, [childId]);

  useEffect(issue, [issue]);

  // Emissão pedida pelo usuário (novo QR, nova tentativa): volta ao carregando.
  const reissue = () => {
    setPhase("loading");
    issue();
  };

  // Contagem regressiva: recalcula pela hora de expiração, não por
  // decremento, para não atrasar com a tela em segundo plano.
  useEffect(() => {
    if (phase !== "ready" || !issued) return;
    const expiresAt = new Date(issued.expires_at).getTime();
    const tick = setInterval(() => {
      const left = expiresAt - Date.now();
      setRemaining(left);
      if (left <= 0) setPhase("expired");
    }, 1000);
    return () => clearInterval(tick);
  }, [phase, issued]);

  // Leitura feita pela equipe = check-in aberto. Falha de rede na consulta
  // não diz nada: segue tentando até o QR expirar.
  useEffect(() => {
    if (phase !== "ready") return;
    const poll = setInterval(() => {
      getOpenCheckin(childId)
        .then((open) => {
          if (open) setPhase("used");
        })
        .catch(() => undefined);
    }, USED_POLL_MS);
    return () => clearInterval(poll);
  }, [phase, childId]);

  const goToCode = () => router.replace({ pathname: "/kids/codigo/[id]", params: { id: childId, feito: "1" } });

  if (phase === "loading") return <Screen>{null}</Screen>;

  if (phase === "error") {
    const failure = error!;
    return (
      <StatusMessage
        testID="qr-error"
        icon={failure.offline ? WifiOff : CircleAlert}
        message={failure.message}
        description={failure.description}
        tone="danger"
      >
        <AppButton testID="qr-retry" title="Tentar de novo" variant="secondary" onPress={reissue} />
      </StatusMessage>
    );
  }

  if (phase === "refused") {
    return (
      <StatusMessage testID="qr-recusado" icon={Baby} message={refusal ?? ""}>
        <AppButton testID="qr-ver-codigo" title="Ver código de retirada" onPress={goToCode} />
      </StatusMessage>
    );
  }

  if (phase === "used") {
    return (
      <StatusMessage
        testID="qr-usado"
        icon={CircleCheck}
        message="QR lido, check-in feito"
        description="A equipe recebeu a criança. Use o código de retirada na hora de buscar."
      >
        <View style={styles.actions}>
          <AppButton testID="qr-ver-codigo" title="Ver código de retirada" onPress={goToCode} />
          <AppButton
            testID="qr-novo"
            title="Gerar novo QR"
            icon={RefreshCw}
            variant="ghost"
            onPress={reissue}
          />
        </View>
      </StatusMessage>
    );
  }

  if (phase === "expired") {
    return (
      <StatusMessage
        testID="qr-expirado"
        icon={Clock}
        message="Este QR expirou"
        description="Ele vale 5 minutos e uma leitura. Gere um novo e mostre à equipe."
      >
        <AppButton testID="qr-novo" title="Gerar novo QR" icon={RefreshCw} onPress={reissue} />
      </StatusMessage>
    );
  }

  const size = Math.min(width - horizontal * 2, qr.maxSize);

  return (
    <Screen>
      <Text style={[typography.h1, { color: colors.textPrimary }]}>QR para o check-in</Text>
      <Text style={[typography.body, styles.lead, { color: colors.textSecondary }]}>
        Mostre este QR ao líder kids na entrada da turma. Ele vale para uma leitura.
      </Text>

      <View style={styles.center}>
        <View style={[styles.plate, { backgroundColor: qr.plate, padding: spacing.md }]}>
          <QrCode
            testID="qr-codigo"
            value={issued!.qr}
            size={size - spacing.md * 2}
            accessibilityLabel="QR de check-in do seu filho"
          />
        </View>
        <Text
          testID="qr-contagem"
          accessibilityLiveRegion="polite"
          style={[typography.h3, styles.countdown, { color: colors.textPrimary }]}
        >
          {formatCountdown(remaining)}
        </Text>
        <Text style={[typography.caption, { color: colors.textTertiary }]}>até o QR expirar</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { marginTop: spacing.sm },
  center: { alignItems: "center", marginTop: spacing.xl, gap: spacing.md, alignSelf: "stretch" },
  plate: { borderRadius: radius.modal, overflow: "hidden" },
  countdown: { marginTop: spacing.sm },
  actions: { alignSelf: "stretch", gap: spacing.sm },
});
