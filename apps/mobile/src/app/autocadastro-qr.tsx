// QR de autocadastro em tela cheia, para projetar no culto (v2 — `QRScreen`
// com `auto` em docs/design/orbita-v2/produto/proto/app-screens.jsx).
//
// Quem lê esta tela é o visitante, do outro lado do salão: o texto fala com
// ele, não com quem segura o celular. Brilho no máximo e tela acesa
// (`usePresentationMode`) pelo tempo que ela ficar aberta.
//
// O QR abre a página pública de autocadastro do web
// (`signupUrl` em src/lib/visitantes/visitantes-client.ts). Sem `webUrl` no
// build ou sem o slug da igreja, não há endereço para montar — a tela diz
// isso em vez de mostrar um QR que leva a lugar nenhum.
import Constants from "expo-constants";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { FullScreenFrame, useFrameTopInset } from "../components/FullScreenFrame";
import { QrCode } from "../components/QrCode";
import { useScreenPadding } from "../components/Screen";
import { StatusMessage } from "../components/StatusMessage";
import { usePresentationMode } from "../lib/qr/use-presentation-mode";
import { CircleAlert } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { qr, radius, spacing, typography } from "../lib/theme/tokens";
import { signupUrl } from "../lib/visitantes/visitantes-client";

export default function AutocadastroQrScreen() {
  const { token, title } = useLocalSearchParams<{ token: string; title?: string }>();
  const { colors, appName, tenantSlug } = useTheme();
  const { width } = useWindowDimensions();
  const horizontal = useScreenPadding();
  const topInset = useFrameTopInset();
  usePresentationMode();

  const webUrl = Constants.expoConfig?.extra?.webUrl as string | undefined;

  if (!webUrl || !tenantSlug || !token) {
    return (
      <FullScreenFrame testID="autocadastro-qr-indisponivel">
        <StatusMessage
          testID="autocadastro-qr-sem-endereco"
          icon={CircleAlert}
          tone="danger"
          message="Não foi possível montar o endereço do cadastro."
          description="Feche e abra o QR de novo. Se continuar, avise o suporte da Orbien."
        />
      </FullScreenFrame>
    );
  }

  const size = Math.min(width - horizontal * 2, qr.maxSize);

  return (
    <FullScreenFrame testID="autocadastro-qr">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset, paddingHorizontal: horizontal },
        ]}
      >
        <Text style={[typography.display, styles.center, { color: colors.textPrimary }]}>
          Primeira vez aqui?
        </Text>
        <Text style={[typography.body, styles.lead, { color: colors.textSecondary }]}>
          Aponte a câmera do celular para o código e deixe seu nome e WhatsApp.
        </Text>

        <View style={[styles.plate, { width: size, height: size, backgroundColor: qr.plate }]}>
          <QrCode
            testID="autocadastro-qr-code"
            value={signupUrl(webUrl, tenantSlug, token)}
            size={size}
            accessibilityLabel="QR de autocadastro de visitante"
          />
        </View>

        <Text
          testID="autocadastro-qr-origem"
          style={[typography.h3, styles.origin, { color: colors.textPrimary }]}
        >
          {title || appName}
        </Text>
        <Text style={[typography.caption, styles.center, { color: colors.textTertiary }]}>
          Não precisa instalar nada.
        </Text>
      </ScrollView>
    </FullScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: "center", paddingBottom: spacing.xxxl },
  center: { textAlign: "center" },
  lead: { marginTop: spacing.sm, marginBottom: spacing.xxl, textAlign: "center" },
  plate: { borderRadius: radius.modal, overflow: "hidden" },
  origin: { marginTop: spacing.xl, textAlign: "center" },
});
