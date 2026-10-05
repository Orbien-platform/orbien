// QR de check-in do encontro (PROD-12, v2 — `QRScreen` em
// docs/design/orbita-v2/produto/proto/app-screens.jsx).
//
// O líder abre pelo encontro ou pela presença; os membros leem com o leitor
// do app (`/checkin`) e a presença é gravada sozinha. Tela cheia, brilho no
// máximo e sem apagar (`usePresentationMode`), porque o celular passa de mão
// em mão pela sala.
//
// Abrir a tela GERA o código: a API não tem leitura do token vigente, só o
// `upsert` que troca o valor e reabre as 4h. Na prática é o que se quer —
// quem abre o QR vai mostrá-lo agora —, e o código anterior deixa de valer
// (quem já fez check-in continua com a presença gravada).
//
// Regra da v2: o QR vale 4h e pode ser gerado até 24h depois do encontro. As
// duas contas são da API (`createCheckinToken`); aqui só se mostra o
// relógio e se traduz o 409 de "encontro velho demais".
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { Alert } from "../../../../components/Alert";
import { AppButton } from "../../../../components/AppButton";
import { FullScreenFrame, useFrameTopInset } from "../../../../components/FullScreenFrame";
import { QrCode } from "../../../../components/QrCode";
import { useScreenPadding } from "../../../../components/Screen";
import { StatusMessage } from "../../../../components/StatusMessage";
import { HttpError } from "../../../../lib/api/errors";
import { describeLoadError, type LoadErrorState } from "../../../../lib/api/load-error";
import { formatTime } from "../../../../lib/format/date";
import {
  createCheckinToken,
  getMeeting,
} from "../../../../lib/pequenos-grupos/pequenos-grupos-client";
import type { CheckinToken } from "../../../../lib/pequenos-grupos/types";
import { buildCheckinPayload } from "../../../../lib/qr/checkin-payload";
import { formatRemaining } from "../../../../lib/qr/countdown";
import { usePresentationMode } from "../../../../lib/qr/use-presentation-mode";
import {
  CalendarOff,
  CircleAlert,
  Lock,
  RefreshCw,
  Timer,
  UserCheck,
  WifiOff,
} from "../../../../lib/theme/icons";
import { useTheme } from "../../../../lib/theme/theme-provider";
import {
  ICON_STROKE_WIDTH,
  iconSize,
  progressBarHeight,
  qr,
  radius,
  spacing,
  typography,
} from "../../../../lib/theme/tokens";

/** De quanto em quanto tempo a contagem de check-ins é relida. */
export const ATTENDANCE_POLL_MS = 15_000;

type LoadFailure =
  | { kind: "too-old" }
  | { kind: "forbidden" }
  | { kind: "error"; state: LoadErrorState };

function describeFailure(error: unknown): LoadFailure {
  if (error instanceof HttpError && error.status === 409) return { kind: "too-old" };
  if (error instanceof HttpError && error.status === 403) return { kind: "forbidden" };
  return { kind: "error", state: describeLoadError(error, "o código de check-in") };
}

interface IssuedToken extends CheckinToken {
  /** Quando o app recebeu o token — base da barra de tempo restante. */
  issuedAt: number;
}

export default function CheckinQrScreen() {
  const { id: meetingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, brandInk } = useTheme();
  const { width } = useWindowDimensions();
  const horizontal = useScreenPadding();
  const topInset = useFrameTopInset();
  usePresentationMode();

  const [token, setToken] = useState<IssuedToken | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState(false);
  const [checkins, setCheckins] = useState<number | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [attempt, setAttempt] = useState(0);
  const renewingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    createCheckinToken(meetingId)
      .then((issued) => {
        if (cancelled) return;
        setToken({ ...issued, issuedAt: Date.now() });
        setNow(Date.now());
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(describeFailure(err));
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId, attempt]);

  // Relógio da contagem: um tique por segundo basta para o "45 s" final.
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [token]);

  // Quantos já fizeram check-in. Falha aqui não derruba a tela: o QR é o
  // que importa, a contagem só some até a próxima leitura dar certo.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () =>
      getMeeting(meetingId)
        .then((meeting) => {
          if (cancelled) return;
          setCheckins(meeting.attendanceRecords.length);
          setTopic(meeting.topic);
        })
        .catch(() => undefined);
    load();
    const timer = setInterval(load, ATTENDANCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [meetingId, token]);

  async function renew() {
    if (renewingRef.current) return;
    renewingRef.current = true;
    setRenewing(true);
    setRenewError(false);
    try {
      const issued = await createCheckinToken(meetingId);
      setToken({ ...issued, issuedAt: Date.now() });
      setNow(Date.now());
    } catch {
      // O código que está na tela continua valendo até a hora que mostra.
      setRenewError(true);
    } finally {
      renewingRef.current = false;
      setRenewing(false);
    }
  }

  if (failure) {
    return (
      <FullScreenFrame testID="checkin-qr-falha">
        {failure.kind === "too-old" ? (
          <StatusMessage
            testID="checkin-qr-encerrado"
            icon={CalendarOff}
            message="Este encontro passou há mais de 24 horas."
            description="O QR de check-in só pode ser gerado até 24 horas depois do encontro. Registre a presença na lista."
          >
            <AppButton
              testID="checkin-qr-ir-presenca"
              title="Registrar presença"
              icon={UserCheck}
              onPress={() => router.replace(`/grupo/encontro/${meetingId}/presenca`)}
            />
          </StatusMessage>
        ) : failure.kind === "forbidden" ? (
          <StatusMessage
            testID="checkin-qr-sem-acesso"
            icon={Lock}
            message="Só a liderança do grupo mostra o QR de check-in."
            description="Se você lidera este grupo, peça à secretaria para conferir seu papel."
          />
        ) : (
          <StatusMessage
            testID="checkin-qr-erro"
            icon={failure.state.offline ? WifiOff : CircleAlert}
            message={failure.state.message}
            description={failure.state.description}
            tone="danger"
          >
            <AppButton
              testID="checkin-qr-retry"
              title="Tentar novamente"
              icon={RefreshCw}
              variant="secondary"
              onPress={() => {
                setFailure(null);
                setAttempt((n) => n + 1);
              }}
            />
          </StatusMessage>
        )}
      </FullScreenFrame>
    );
  }

  const expiresAt = token ? new Date(token.expires_at).getTime() : 0;
  const remaining = Math.max(0, expiresAt - now);
  const expired = token !== null && remaining === 0;
  const total = token ? Math.max(1, expiresAt - token.issuedAt) : 1;
  const plateSize = Math.min(width - horizontal * 2, qr.maxSize);
  const until = token ? formatTime(token.expires_at) : null;

  return (
    <FullScreenFrame testID="checkin-qr">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset, paddingHorizontal: horizontal },
        ]}
      >
        <Text style={[typography.h1, { color: colors.textPrimary }]}>Check-in</Text>
        <Text
          numberOfLines={1}
          style={[typography.body, styles.subtitle, { color: colors.textSecondary }]}
        >
          {topic ?? "Encontro"}
        </Text>

        <View
          style={[
            styles.plate,
            { width: plateSize, height: plateSize, backgroundColor: qr.plate },
            expired && styles.plateExpired,
          ]}
        >
          {token ? (
            <QrCode
              testID="checkin-qr-code"
              value={buildCheckinPayload(token.token)}
              size={plateSize}
              accessibilityLabel="QR de check-in do encontro"
            />
          ) : null}
        </View>

        {token ? (
          <>
            {expired ? (
              <Text
                testID="checkin-qr-expirado"
                style={[typography.h3, styles.status, { color: colors.danger }]}
              >
                Código expirado
              </Text>
            ) : (
              <Text
                testID="checkin-qr-validade"
                style={[typography.h3, styles.status, { color: colors.textPrimary }]}
              >
                Válido até {until}
              </Text>
            )}

            <View style={styles.countdownRow}>
              <Timer
                size={iconSize.inline}
                color={expired ? colors.textTertiary : brandInk}
                strokeWidth={ICON_STROKE_WIDTH}
              />
              <Text
                testID="checkin-qr-restante"
                style={[typography.mono, { color: expired ? colors.textTertiary : brandInk }]}
              >
                {expired ? "Gere um novo para continuar" : `${formatRemaining(remaining)} restantes`}
              </Text>
            </View>

            <View
              style={[styles.track, { width: plateSize, backgroundColor: colors.bgSubtle }]}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round((remaining / total) * 100) }}
            >
              <View
                style={[
                  styles.fill,
                  { width: `${(remaining / total) * 100}%`, backgroundColor: colors.success },
                ]}
              />
            </View>

            <Text
              style={[typography.bodyMedium, styles.hint, { color: colors.textSecondary }]}
            >
              Os membros leem este código com a câmera do app, em Fazer check-in.
            </Text>

            {checkins !== null ? (
              <Text
                testID="checkin-qr-contagem"
                style={[typography.caption, styles.count, { color: colors.textTertiary }]}
              >
                {checkins === 1 ? "1 presença registrada" : `${checkins} presenças registradas`}
              </Text>
            ) : null}

            {renewError ? (
              <View style={styles.alert}>
                <Alert
                  messageTestID="checkin-qr-renovar-erro"
                  message={
                    expired
                      ? "Não foi possível gerar um novo código. Tente de novo."
                      : `Não foi possível renovar. O código atual vale até ${until}.`
                  }
                />
              </View>
            ) : null}

            <AppButton
              testID="checkin-qr-renovar"
              title={expired ? "Gerar novo código" : "Renovar código"}
              icon={RefreshCw}
              variant={expired ? "primary" : "secondary"}
              loading={renewing}
              onPress={renew}
              style={styles.renew}
            />
          </>
        ) : (
          <Text
            testID="checkin-qr-carregando"
            style={[typography.bodyMedium, styles.status, { color: colors.textSecondary }]}
          >
            Gerando o código…
          </Text>
        )}
      </ScrollView>
    </FullScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "center", paddingBottom: spacing.xxxl },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.xxl },
  plate: { borderRadius: radius.modal, overflow: "hidden" },
  plateExpired: { opacity: 0.25 },
  status: { marginTop: spacing.xl },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  track: {
    height: progressBarHeight,
    borderRadius: radius.pill,
    overflow: "hidden",
    marginTop: spacing.md,
  },
  fill: { height: "100%", borderRadius: radius.pill },
  hint: { marginTop: spacing.lg, textAlign: "center", maxWidth: 300 },
  count: { marginTop: spacing.sm },
  alert: { alignSelf: "stretch", marginTop: spacing.lg },
  renew: { marginTop: spacing.lg, alignSelf: "stretch" },
});
