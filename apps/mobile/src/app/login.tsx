// Tela de Login (MOB-01) — tenant_slug + email + senha, chama
// useAuth().login e navega para a rota inicial em caso de sucesso.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";

import { useAuth } from "../lib/auth/auth-provider";

// Mensagem de erro genérica (AC 2, MOB-01): a API já responde de forma
// indistinguível para credencial errada / tenant não encontrado — a tela
// não tenta adivinhar o motivo, mesmo princípio das rotas de plataforma
// documentado no CLAUDE.md raiz.
const GENERIC_ERROR_MESSAGE = "Não foi possível entrar. Confira os dados e tente novamente.";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
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
      router.replace("/");
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <TextInput
        testID="tenant-slug-input"
        placeholder="Igreja"
        value={tenantSlug}
        onChangeText={setTenantSlug}
        autoCapitalize="none"
      />
      <TextInput
        testID="email-input"
        placeholder="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        testID="password-input"
        placeholder="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error ? <Text testID="login-error">{error}</Text> : null}
      <Button testID="login-submit" title="Entrar" onPress={handleSubmit} disabled={submitting} />
    </View>
  );
}
