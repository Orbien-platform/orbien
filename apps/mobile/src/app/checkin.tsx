// Leitor do QR de check-in (PROD-12, v2 — `ScanScreen` em
// docs/design/orbita-v2/produto/proto/app-screens.jsx).
//
// O membro aponta a câmera para o QR que o líder mostra e a presença é
// gravada por `POST /small-groups/meetings/checkin`. Quem decide se a
// pessoa participa do grupo e se o código ainda vale é a API; aqui cada
// resposta vira um estado com o que fazer a seguir.
//
// Câmera é `expo-camera` (SDK 57): `useCameraPermissions` para a permissão
// e `CameraView` com `barcodeScannerSettings` só de QR. Três caminhos de
// permissão: ainda não perguntada (explica e pede), negada mas perguntável
// de novo (pede de novo) e bloqueada (`canAskAgain: false` — o sistema não
// mostra mais o diálogo, então o único caminho é abrir os ajustes).
//
// `onBarcodeScanned` dispara várias vezes por segundo enquanto o código
// está no quadro. A trava é um ref, não estado: entre o primeiro disparo e
// o re-render, os seguintes já chegaram.
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../components/AppButton";
import { FullScreenFrame } from "../components/FullScreenFrame";
import { StatusMessage } from "../components/StatusMessage";
import { HttpError, NetworkError } from "../lib/api/errors";
import { checkIn } from "../lib/pequenos-grupos/pequenos-grupos-client";
import { parseCheckinPayload } from "../lib/qr/checkin-payload";
import {
  Camera,
  CircleAlert,
  CircleCheck,
  Lock,
  RefreshCw,
  ScanLine,
  Settings,
  WifiOff,
} from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import {
  ICON_STROKE_WIDTH,
  qr,
  radius,
  spacing,
  successMark,
  typography,
} from "../lib/theme/tokens";

/** Por quanto tempo o aviso "este QR não é de check-in" fica na tela. */
export const WRONG_CODE_HINT_MS = 2500;

type Phase =
  | { kind: "scanning" }
  | { kind: "sending"; token: string }
  | { kind: "done"; already: boolean }
  | { kind: "expired" }
  | { kind: "not-member" }
  | { kind: "failed"; token: string; offline: boolean };

export default function CheckinScannerScreen() {
  const router = useRouter();
  const { colors, brandInk } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [wrongCode, setWrongCode] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const lockRef = useRef(false);
  const lastRejectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!wrongCode) return;
    const timer = setTimeout(() => {
      setWrongCode(false);
      lastRejectedRef.current = null;
    }, WRONG_CODE_HINT_MS);
    return () => clearTimeout(timer);
  }, [wrongCode]);

  async function submit(token: string) {
    lockRef.current = true;
    setPhase({ kind: "sending", token });
    try {
      const result = await checkIn(token);
      setPhase({ kind: "done", already: result.status === "already_checked_in" });
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) setPhase({ kind: "expired" });
      else if (err instanceof HttpError && err.status === 403) setPhase({ kind: "not-member" });
      else setPhase({ kind: "failed", token, offline: err instanceof NetworkError });
    }
  }

  function handleScanned({ data }: BarcodeScanningResult) {
    if (lockRef.current) return;
    const token = parseCheckinPayload(data);
    if (!token) {
      // O mesmo código errado continua no quadro: avisar uma vez basta.
      if (lastRejectedRef.current !== data) {
        lastRejectedRef.current = data;
        setWrongCode(true);
      }
      return;
    }
    setWrongCode(false);
    void submit(token);
  }

  function scanAgain() {
    lockRef.current = false;
    lastRejectedRef.current = null;
    setPhase({ kind: "scanning" });
  }

  if (!permission) {
    return (
      <FullScreenFrame testID="checkin-permissao-carregando">
        <View style={styles.centered}>
          <ActivityIndicator color={brandInk} />
        </View>
      </FullScreenFrame>
    );
  }

  if (!permission.granted) {
    return (
      <FullScreenFrame testID="checkin-permissao">
        {permission.canAskAgain ? (
          <StatusMessage
            testID="checkin-permissao-pedir"
            icon={Camera}
            message="Para fazer check-in, o app precisa da câmera."
            description="Ela só é usada para ler o QR que o líder mostra no encontro."
          >
            <AppButton
              testID="checkin-permitir"
              title="Permitir câmera"
              icon={Camera}
              onPress={() => {
                requestPermission().catch(() => undefined);
              }}
            />
          </StatusMessage>
        ) : (
          <StatusMessage
            testID="checkin-permissao-negada"
            icon={Lock}
            message="A câmera está bloqueada para o app."
            description="Libere o acesso à câmera nos ajustes do aparelho e volte para ler o QR do líder."
          >
            <AppButton
              testID="checkin-abrir-ajustes"
              title="Abrir ajustes"
              icon={Settings}
              variant="secondary"
              onPress={() => {
                Linking.openSettings().catch(() => undefined);
              }}
            />
          </StatusMessage>
        )}
      </FullScreenFrame>
    );
  }

  if (phase.kind === "done") {
    return (
      <FullScreenFrame testID="checkin-sucesso">
        <View style={styles.centered}>
          <View style={[styles.doneHalo, { backgroundColor: colors.successDim }]}>
            <CircleCheck
              size={successMark.icon}
              color={colors.success}
              strokeWidth={ICON_STROKE_WIDTH}
            />
          </View>
          <Text style={[typography.h1, styles.doneTitle, { color: colors.textPrimary }]}>
            {phase.already ? "Você já estava na lista" : "Presença confirmada"}
          </Text>
          <Text style={[typography.body, styles.doneText, { color: colors.textSecondary }]}>
            {phase.already
              ? "Sua presença neste encontro já tinha sido registrada."
              : "Sua presença neste encontro foi registrada."}
          </Text>
          <AppButton
            testID="checkin-concluir"
            title="Concluir"
            onPress={() => router.back()}
            style={styles.doneButton}
          />
        </View>
      </FullScreenFrame>
    );
  }

  if (phase.kind === "expired" || phase.kind === "not-member" || phase.kind === "failed") {
    const retry =
      phase.kind === "failed" ? (
        <AppButton
          testID="checkin-reenviar"
          title="Tentar novamente"
          icon={RefreshCw}
          onPress={() => void submit(phase.token)}
        />
      ) : null;

    return (
      <FullScreenFrame testID="checkin-falha">
        <StatusMessage
          testID={`checkin-${phase.kind}`}
          icon={
            phase.kind === "not-member"
              ? Lock
              : phase.kind === "failed" && phase.offline
                ? WifiOff
                : CircleAlert
          }
          tone={phase.kind === "failed" ? "danger" : "default"}
          message={
            phase.kind === "expired"
              ? "Este QR expirou ou foi renovado."
              : phase.kind === "not-member"
                ? "Você não está neste grupo."
                : phase.offline
                  ? "Sem conexão para confirmar a presença."
                  : "Não foi possível confirmar a presença."
          }
          description={
            phase.kind === "expired"
              ? "Peça ao líder para mostrar o código que está na tela dele agora."
              : phase.kind === "not-member"
                ? "O check-in vale para quem participa do grupo do encontro. Fale com o líder para entrar."
                : phase.offline
                  ? "O código lido continua guardado. Tente de novo quando a conexão voltar."
                  : "O problema é do nosso lado. Tente de novo em instantes."
          }
        >
          <View style={styles.actions}>
            {retry}
            <AppButton
              testID="checkin-ler-de-novo"
              title="Ler outro QR"
              icon={ScanLine}
              variant={retry ? "ghost" : "secondary"}
              onPress={scanAgain}
            />
          </View>
        </StatusMessage>
      </FullScreenFrame>
    );
  }

  if (cameraFailed) {
    return (
      <FullScreenFrame testID="checkin-camera-falhou">
        <StatusMessage
          testID="checkin-camera-erro"
          icon={Camera}
          tone="danger"
          message="Não foi possível abrir a câmera."
          description="Feche outros apps que estejam usando a câmera e tente de novo."
        >
          <AppButton
            testID="checkin-camera-retry"
            title="Tentar novamente"
            icon={RefreshCw}
            variant="secondary"
            onPress={() => {
              setCameraFailed(false);
              setCameraKey((n) => n + 1);
            }}
          />
        </StatusMessage>
      </FullScreenFrame>
    );
  }

  const sending = phase.kind === "sending";

  return (
    <FullScreenFrame testID="checkin-leitor" overCamera>
      <CameraView
        key={cameraKey}
        testID="checkin-camera"
        style={StyleSheet.absoluteFill}
        facing="back"
        active={!sending}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={sending ? undefined : handleScanned}
        onMountError={() => setCameraFailed(true)}
      />
      {/* Véu em quatro peças em volta do quadro: o QR dentro dele fica
          com a imagem limpa, o resto da câmera escurece. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.flex, { backgroundColor: qr.scanScrim }]} />
        <View style={styles.frameRow}>
          <View style={[styles.flex, { backgroundColor: qr.scanScrim }]} />
          <View style={[styles.frame, { borderColor: qr.scanInk }]} />
          <View style={[styles.flex, { backgroundColor: qr.scanScrim }]} />
        </View>
        <View style={[styles.flex, styles.below, { backgroundColor: qr.scanScrim }]}>
          <Text style={[typography.h3, styles.instruction, { color: qr.scanInk }]}>
            {sending ? "Confirmando presença…" : "Aponte para o QR do líder"}
          </Text>
          {sending ? (
            <ActivityIndicator testID="checkin-enviando" color={qr.scanInk} style={styles.spinner} />
          ) : wrongCode ? (
            <Text
              testID="checkin-qr-errado"
              accessibilityRole="alert"
              style={[typography.bodyMedium, styles.hint, { color: qr.scanInk }]}
            >
              Este QR não é de check-in. Procure o código na tela do líder.
            </Text>
          ) : (
            <Text style={[typography.bodyMedium, styles.hint, { color: qr.scanInk }]}>
              A leitura é automática.
            </Text>
          )}
        </View>
      </View>
    </FullScreenFrame>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  doneHalo: {
    width: successMark.halo,
    height: successMark.halo,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: { marginTop: spacing.xl, textAlign: "center" },
  doneText: { marginTop: spacing.sm, textAlign: "center" },
  doneButton: { marginTop: spacing.xxl, alignSelf: "stretch" },
  actions: { alignSelf: "stretch", gap: spacing.sm },
  flex: { flex: 1 },
  frameRow: { flexDirection: "row" },
  // Raio de campo, não de modal: o véu é reto por fora, e um raio grande
  // deixaria os quatro cantos do quadro sem escurecer.
  frame: {
    width: qr.scanFrame,
    height: qr.scanFrame,
    borderWidth: qr.scanFrameBorder,
    borderRadius: radius.input,
  },
  below: { alignItems: "center", paddingHorizontal: spacing.xxl },
  instruction: { marginTop: spacing.xxl, textAlign: "center" },
  hint: { marginTop: spacing.sm, textAlign: "center" },
  spinner: { marginTop: spacing.md },
});
