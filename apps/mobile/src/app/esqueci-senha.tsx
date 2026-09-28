// Tela de recuperação de senha — pede o e-mail e chama
// `POST /auth/forgot-password` (rota pública, já existe na API e é usada
// hoje por `apps/web/src/app/(public)/esqueci-senha/page.tsx`).
//
// A redefinição em si (definir a nova senha a partir do token do e-mail)
// continua acontecendo na página web (`/redefinir-senha`) — o e-mail que a
// API envia aponta para lá (`FRONTEND_URL`), então esta tela só cobre o
// pedido do link; o usuário troca a senha no navegador e volta a entrar
// pelo app. Sem isso não haveria como abrir um link `https://` direto numa
// tela nativa sem mexer no backend (deep link) — decisão registrada em
// docs/PLANO.md (PROD-26).
//
// Mesmo princípio de não vazar informação do `login.tsx` (AC 2, MOB-01): a
// resposta é sempre a mesma mensagem de sucesso, tenha o e-mail conta ou
// não, e mesmo se a chamada falhar por erro de rede — mesmo padrão do
// formulário web equivalente.
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "../components/AppButton";
import { AppLink } from "../components/AppLink";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { forgotPassword } from "../lib/auth/auth-client";
import { Mail } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, radius, spacing, typography } from "../lib/theme/tokens";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors, isDark, primaryColor } = useTheme();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
    } catch {
      // A API já responde de forma genérica; erro de rede não muda o que a
      // tela mostra — não há como distinguir "e-mail não existe" de "sem
      // internet" sem abrir a mesma brecha que o backend fecha.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <Screen scroll center testID="forgot-password-screen">
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        style={[
          styles.card,
          { backgroundColor: colors.bgSurface, borderColor: colors.border },
        ]}
      >
        <Text style={[typography.h1, { color: colors.textPrimary }]}>Recuperar senha</Text>

        {sent ? (
          <View style={styles.success}>
            <Mail size={iconSize.emphasis} color={primaryColor} strokeWidth={ICON_STROKE_WIDTH} />
            <Text
              testID="forgot-password-success"
              style={[typography.body, styles.successText, { color: colors.textPrimary }]}
            >
              Se o e-mail estiver cadastrado, você vai receber um link de redefinição em
              instantes.
            </Text>
            <AppLink testID="forgot-password-back" onPress={() => router.back()}>
              Voltar para o login
            </AppLink>
          </View>
        ) : (
          <>
            <Text style={[typography.body, styles.subtitle, { color: colors.textSecondary }]}>
              Informe o e-mail da sua conta. Vamos enviar um link para você criar uma senha
              nova.
            </Text>
            <Input
              testID="forgot-password-email-input"
              label="E-mail"
              icon={Mail}
              placeholder="voce@exemplo.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />
            <AppButton
              testID="forgot-password-submit"
              title="Enviar link de redefinição"
              onPress={handleSubmit}
              loading={submitting}
              disabled={!email.trim()}
              style={styles.submit}
            />
            <View style={styles.cancel}>
              <AppLink testID="forgot-password-cancel" onPress={() => router.back()}>
                Voltar para o login
              </AppLink>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.xxl,
  },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.lg },
  submit: { marginTop: spacing.xs },
  cancel: { alignItems: "center", marginTop: spacing.xs },
  success: { alignItems: "center", paddingVertical: spacing.md },
  successText: { textAlign: "center", marginTop: spacing.md, marginBottom: spacing.lg },
});
