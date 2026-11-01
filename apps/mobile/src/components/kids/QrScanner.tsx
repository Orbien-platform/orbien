// Leitor de QR do Kids para a equipe (MOB-3). Mesmo padrão de `app/checkin.tsx`
// (PG): `useCameraPermissions` e `CameraView` só de QR, com a trava num ref —
// `onBarcodeScanned` dispara várias vezes por segundo com o código no quadro.
//
// Não decide o que o QR significa: entrega o texto a `onScan`, que devolve
// `true` se aceitou (a leitura trava até o pai desmontar o leitor) ou `false`
// se não era QR do Kids (o leitor segue e não repete o aviso do mesmo código).
// Câmera negada ou bloqueada nunca é beco sem saída: `onClose` leva de volta
// ao código digitado.
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRef, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";

import { Camera, Lock, RefreshCw, Settings } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { qr, radius, spacing, typography } from "../../lib/theme/tokens";
import { AppButton } from "../AppButton";
import { StatusMessage } from "../StatusMessage";

interface QrScannerProps {
  onScan: (data: string) => boolean;
  /** Fecha o leitor e volta ao código digitado. */
  onClose: () => void;
  /** Aviso sobre a última leitura recusada (ex.: "Este QR não é do Kids"). */
  notice?: string | null;
}

export function QrScanner({ onScan, onClose, notice }: QrScannerProps) {
  const { colors, brandInk } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFailed, setCameraFailed] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const lockRef = useRef(false);
  const lastRejectedRef = useRef<string | null>(null);

  function handleScanned({ data }: BarcodeScanningResult) {
    if (lockRef.current || data === lastRejectedRef.current) return;
    if (onScan(data)) lockRef.current = true;
    else lastRejectedRef.current = data;
  }

  const typeInstead = (
    <AppButton testID="scanner-digitar" title="Digitar o código" variant="ghost" onPress={onClose} />
  );

  if (!permission) {
    return (
      <View testID="scanner-carregando" style={styles.centered}>
        <ActivityIndicator color={brandInk} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <StatusMessage
        testID={permission.canAskAgain ? "scanner-permissao-pedir" : "scanner-permissao-negada"}
        icon={permission.canAskAgain ? Camera : Lock}
        message={
          permission.canAskAgain ? "Para ler o QR, o app precisa da câmera." : "A câmera está bloqueada para o app."
        }
        description={
          permission.canAskAgain
            ? "Ela só é usada para ler o QR do responsável. Se preferir, digite o código."
            : "Libere a câmera nos ajustes do aparelho, ou digite o código de retirada."
        }
      >
        <View style={styles.actions}>
          {permission.canAskAgain ? (
            <AppButton
              testID="scanner-permitir"
              title="Permitir câmera"
              icon={Camera}
              onPress={() => {
                requestPermission().catch(() => undefined);
              }}
            />
          ) : (
            <AppButton
              testID="scanner-ajustes"
              title="Abrir ajustes"
              icon={Settings}
              variant="secondary"
              onPress={() => {
                Linking.openSettings().catch(() => undefined);
              }}
            />
          )}
          {typeInstead}
        </View>
      </StatusMessage>
    );
  }

  if (cameraFailed) {
    return (
      <StatusMessage
        testID="scanner-camera-erro"
        icon={Camera}
        tone="danger"
        message="Não foi possível abrir a câmera."
        description="Feche outros apps que usam a câmera e tente de novo, ou digite o código."
      >
        <View style={styles.actions}>
          <AppButton
            testID="scanner-camera-retry"
            title="Tentar novamente"
            icon={RefreshCw}
            variant="secondary"
            onPress={() => {
              setCameraFailed(false);
              setCameraKey((n) => n + 1);
            }}
          />
          {typeInstead}
        </View>
      </StatusMessage>
    );
  }

  return (
    <View testID="scanner" style={styles.wrap}>
      <View style={[styles.viewport, { borderColor: colors.border }]}>
        <CameraView
          key={cameraKey}
          testID="scanner-camera"
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleScanned}
          onMountError={() => setCameraFailed(true)}
        />
        <View pointerEvents="none" style={[styles.frame, { borderColor: qr.scanInk }]} />
      </View>
      <Text style={[typography.bodyMedium, styles.hint, { color: colors.textSecondary }]}>
        Aponte para o QR da tela do responsável. A leitura é automática.
      </Text>
      {notice ? (
        <Text
          testID="scanner-aviso"
          accessibilityRole="alert"
          style={[typography.bodyMedium, styles.hint, { color: colors.danger }]}
        >
          {notice}
        </Text>
      ) : null}
      {typeInstead}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  centered: { padding: spacing.xxl, alignItems: "center" },
  actions: { alignSelf: "stretch", gap: spacing.sm },
  viewport: {
    height: qr.scanFrame + spacing.xxl * 2,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: qr.scanFrame,
    height: qr.scanFrame,
    borderWidth: qr.scanFrameBorder,
    borderRadius: radius.input,
  },
  hint: { textAlign: "center" },
});
