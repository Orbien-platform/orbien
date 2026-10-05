// Tela de Login (MOB-01) — email + senha, chama useAuth().login. Não
// navega: quem tira esta rota do ar e leva ao shell é o `Stack.Protected` do
// layout raiz, assim que `status` vira "authenticated" (src/app/_layout.tsx).
// Um `router.replace("/")` aqui disputaria com o guard — a rota autenticada
// ainda nem existe no momento em que ele rodaria.
//
// Visual da v2 ("Órbita"): marca e nome no topo, à esquerda, e o título em
// serifa dizendo o que fazer — entrar com o e-mail da igreja, sem escolher
// igreja (a conta já sabe qual é). Campos de 48px com ícone e label (§3,
// §7), erro como alerta com ícone, botão primário em estado `loading`. Sem
// biometria nesta versão. Depois do login, quem aplica a cor e o logo da
// igreja é a transição `ChurchWelcome` (src/app/_layout.tsx).
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Alert } from "../components/Alert";
import { AppButton } from "../components/AppButton";
import { AppLink } from "../components/AppLink";
import { BrandLogo } from "../components/BrandLogo";
import { Input } from "../components/Input";
import { Screen } from "../components/Screen";
import { useAuth } from "../lib/auth/auth-provider";
import { Eye, EyeOff, Lock, Mail } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { spacing, typography } from "../lib/theme/tokens";

// Mensagem de erro genérica (AC 2, MOB-01): a API já responde de forma
// indistinguível para credencial errada / tenant não encontrado — a tela
// não tenta adivinhar o motivo, mesmo princípio das rotas de plataforma
// documentado no CLAUDE.md raiz.
const GENERIC_ERROR_MESSAGE = "Não foi possível entrar. Confira os dados e tente novamente.";

/** Lado da marca no topo da tela, em dp. */
const LOGO_SIZE = 64;

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const { appName, colors, isDark, primaryColor } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
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
      <View style={styles.form}>
        <View style={styles.brand}>
          {/* Antes do login não há tenant resolvido: numa build genérica
              esta é a marca da Orbien, e numa build personalizada o logo e
              o nome do tenant só aparecem a partir do segundo login (cache).
              Ver `preLoginLayer` em src/lib/theme/brand-theme.ts. */}
          <BrandLogo size={LOGO_SIZE} color={isDark ? colors.textPrimary : primaryColor} />
          <Text
            style={[typography.h3, styles.appName, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {appName}
          </Text>
        </View>
        <Text style={[typography.body, styles.lead, { color: colors.textSecondary }]}>
          Tão somente creia
        </Text>
      </View>

      <View style={styles.form}>
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

        <View style={styles.forgotPassword}>
          <AppLink testID="forgot-password-link" onPress={() => router.push("/esqueci-senha")}>
            Esqueci minha senha
          </AppLink>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Coluna única, com a largura de leitura de um
  // celular mesmo num tablet.
  form: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  brand: {
    alignItems: "center",
    gap: spacing.md,
  },
  appName: { flexShrink: 1, textAlign: "center" },
  lead: { marginTop: spacing.sm, marginBottom: spacing.xxl, textAlign: "center" },
  submit: { marginTop: spacing.xs },
  forgotPassword: { alignItems: "center" },
});
