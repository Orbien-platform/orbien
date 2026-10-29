// Kids — código de retirada do filho (T32, KIDS-08). O objeto memorável da
// feature: 4 caracteres grandes, à esquerda, relidos a qualquer momento por
// `GET /kids/children/:id/checkin`. A equipe não tem esta tela — ela viu o
// código no check-in e não o relê.
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "../../../components/Alert";
import { AppButton } from "../../../components/AppButton";
import { QrCode } from "../../../components/QrCode";
import { Screen } from "../../../components/Screen";
import { StatusMessage } from "../../../components/StatusMessage";
import { PickupCode } from "../../../components/kids/PickupCode";
import { describeLoadError, type LoadErrorState } from "../../../lib/api/load-error";
import { getOpenCheckin } from "../../../lib/kids/kids-client";
import type { KidsOpenCheckin } from "../../../lib/kids/types";
import { formatTime } from "../../../lib/format/date";
import { Baby, CircleAlert, WifiOff } from "../../../lib/theme/icons";
import { useTheme } from "../../../lib/theme/theme-provider";
import { spacing, typography } from "../../../lib/theme/tokens";

const QR_SIZE = 176;

export default function CodigoScreen() {
  const { colors } = useTheme();
  const { id, feito } = useLocalSearchParams<{ id: string; feito?: string }>();
  // `undefined` é "ainda carregando"; `null`, "sem check-in aberto".
  const [checkin, setCheckin] = useState<KidsOpenCheckin | null | undefined>(undefined);
  const [error, setError] = useState<LoadErrorState | null>(null);

  const load = useCallback(() => {
    getOpenCheckin(id)
      .then((result) => {
        setCheckin(result);
        setError(null);
      })
      .catch((err: unknown) => setError(describeLoadError(err, "o código de retirada")));
  }, [id]);

  useEffect(load, [load]);

  if (error) {
    return (
      <StatusMessage
        testID="codigo-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton testID="codigo-retry" title="Tentar de novo" variant="secondary" onPress={load} />
      </StatusMessage>
    );
  }

  if (checkin === undefined) return <Screen>{null}</Screen>;

  if (checkin === null) {
    return (
      <StatusMessage
        testID="codigo-empty"
        icon={Baby}
        message="Nenhum check-in aberto"
        description="O código aparece aqui depois do check-in, até a criança ser entregue."
      />
    );
  }

  return (
    <Screen>
      {feito ? <Alert tone="success" messageTestID="codigo-feito" message="Check-in feito" /> : null}
      <PickupCode testID="codigo-valor" code={checkin.code} />
      {/* O QR é o mesmo código em outro formato: o código segue como elemento
          principal e funciona digitado. A placa do QR é branca nos dois modos. */}
      <View style={styles.qr}>
        <QrCode
          testID="codigo-qr"
          value={checkin.qr}
          size={QR_SIZE}
          accessibilityLabel="QR de retirada, o mesmo código para a equipe ler"
        />
        <Text style={[typography.bodyMedium, styles.qrHint, { color: colors.textSecondary }]}>
          Ou mostre este QR ao líder: vale o mesmo que o código.
        </Text>
      </View>
      <View style={styles.meta}>
        <Text style={[typography.h3, { color: colors.textPrimary }]}>Turma {checkin.room.name}</Text>
        <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
          Check-in às {formatTime(checkin.checked_in_at)}
        </Text>
        <Text style={[typography.body, styles.hint, { color: colors.textSecondary }]}>
          Diga este código ao líder kids na hora de buscar a criança. Só quem sabe o código e está na lista de
          autorizados pode retirar.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.lg },
  qrHint: { flex: 1 },
  meta: { marginTop: spacing.xl, gap: spacing.xs },
  hint: { marginTop: spacing.md },
});
