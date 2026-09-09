// Tela de Login (MOB-01) — tenant_slug + email + senha, chama
// useAuth().login. Não navega: quem tira esta rota do ar e leva ao shell é
// o `Stack.Protected` do layout raiz, assim que `status` vira
// "authenticated" (src/app/_layout.tsx). Um `router.replace("/")` aqui
// disputaria com o guard — a rota autenticada ainda nem existe no momento
// em que ele rodaria.
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton } from "../components/AppButton";
import { Screen } from "../components/Screen";
import { useAuth } from "../lib/auth/auth-provider";
import { useTheme } from "../lib/theme/theme-provider";
import { colors, radius, spacing, typography } from "../lib/theme/tokens";

// Mensagem de erro genérica (AC 2, MOB-01): a API já responde de forma
// indistinguível para credencial errada / tenant não encontrado — a tela
// não tenta adivinhar o motivo, mesmo princípio das rotas de plataforma
// documentado no CLAUDE.md raiz.
const GENERIC_ERROR_MESSAGE = "Não foi possível entrar. Confira os dados e tente novamente.";

export default function LoginScreen() {
  const { login } = useAuth();
  const theme = useTheme();
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(tenantSlug, email, password);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen center>
      <View style={styles.card}>
        <Text style={[styles.appName, { color: theme.primaryColor }]}>{theme.appName}</Text>
        <TextInput
          testID="tenant-slug-input"
          placeholder="Igreja"
          placeholderTextColor={colors.textMuted}
          value={tenantSlug}
          onChangeText={setTenantSlug}
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          testID="email-input"
          placeholder="E-mail"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          testID="password-input"
          placeholder="Senha"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        {error ? (
          <Text testID="login-error" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <AppButton
          testID="login-submit"
          title="Entrar"
          onPress={handleSubmit}
          disabled={submitting}
          style={styles.submit}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  appName: {
    ...typography.title,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginBottom: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  submit: {
    marginTop: spacing.xs,
  },
});
