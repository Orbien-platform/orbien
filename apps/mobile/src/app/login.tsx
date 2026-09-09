// Tela de Login (MOB-01) — tenant_slug + email + senha, chama
// useAuth().login. Não navega: quem tira esta rota do ar e leva ao shell é
// o `Stack.Protected` do layout raiz, assim que `status` vira
// "authenticated" (src/app/_layout.tsx). Um `router.replace("/")` aqui
// disputaria com o guard — a rota autenticada ainda nem existe no momento
// em que ele rodaria.
//
// Visual conforme STYLE-GUIDE.md: marca do tenant no topo (logo quando há,
// senão o nome no token `display`), campos de 48px com ícone e label (§3,
// §7), erro como alerta com ícone em vez de linha de texto solta, e botão
// primário em estado `loading` — antes o botão só ficava apagado, sem dizer
// que a requisição estava em curso.
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { BrandLogo } from "../components/BrandLogo";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { useAuth } from "../lib/auth/auth-provider";
import { Building2, Eye, EyeOff, Lock, Mail } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { radius, spacing, typography } from "../lib/theme/tokens";

// Mensagem de erro genérica (AC 2, MOB-01): a API já responde de forma
// indistinguível para credencial errada / tenant não encontrado — a tela
// não tenta adivinhar o motivo, mesmo princípio das rotas de plataforma
// documentado no CLAUDE.md raiz.
const GENERIC_ERROR_MESSAGE = "Não foi possível entrar. Confira os dados e tente novamente.";

/** Lado da marca no topo da tela, em dp. */
const LOGO_SIZE = 72;

export default function LoginScreen() {
  const { login } = useAuth();
  const { appName, colors, shadow, isDark, primaryColor } = useTheme();
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
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
    <Screen scroll center>
      {/* Esta é a única tela sem header (`headerShown: false` no layout
          raiz), então a status bar fica sobre `bgBase`, não sobre a cor da
          marca: o `style="light"` do shell deixaria a hora invisível no
          parchment. Sobrescreve enquanto a tela está montada (§8). */}
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.brand}>
        {/* Antes do login não há tenant resolvido: numa build genérica esta
            é a marca da Orbien, e numa build personalizada o logo do tenant
            só aparece a partir do segundo login (cache). Ver `colorsOnly`
            em src/lib/theme/brand-theme.ts. */}
        <View style={styles.logo}>
          <BrandLogo size={LOGO_SIZE} color={isDark ? colors.textPrimary : primaryColor} />
        </View>
        <Text style={[typography.display, styles.appName, { color: colors.textPrimary }]}>
          {appName}
        </Text>
        <Text style={[typography.body, styles.tagline, { color: colors.textSecondary }]}>
          Entre com os dados da sua igreja
        </Text>
      </View>

      <View
        style={[
          styles.card,
          shadow.md,
          { backgroundColor: colors.bgSurface, borderColor: colors.border },
        ]}
      >
        <Input
          testID="tenant-slug-input"
          label="Igreja"
          icon={Building2}
          placeholder="minha-igreja"
          value={tenantSlug}
          onChangeText={setTenantSlug}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="organization"
          returnKeyType="next"
        />
        <Input
          testID="email-input"
          label="E-mail"
          icon={Mail}
          placeholder="voce@exemplo.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
        />
        <Input
          testID="password-input"
          label="Senha"
          icon={Lock}
          placeholder="Sua senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!passwordVisible}
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          trailingIcon={passwordVisible ? EyeOff : Eye}
          onTrailingPress={() => setPasswordVisible((visible) => !visible)}
          trailingAccessibilityLabel={passwordVisible ? "Ocultar senha" : "Mostrar senha"}
        />

        {/* O testID vai no <Text> de dentro: o teste desta tela compara
            `props.children` com a mensagem exata. */}
        {error ? <Alert messageTestID="login-error" message={error} /> : null}

        <AppButton
          testID="login-submit"
          title="Entrar"
          onPress={handleSubmit}
          loading={submitting}
          style={styles.submit}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: "center",
    marginBottom: spacing.xxxl,
  },
  logo: { marginBottom: spacing.lg },
  appName: { textAlign: "center" },
  tagline: {
    textAlign: "center",
    marginTop: spacing.xs,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.xxl,
  },
  submit: { marginTop: spacing.xs },
});
