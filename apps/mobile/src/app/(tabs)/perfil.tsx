// Tela Perfil — quinta aba (o §7 do STYLE-GUIDE.md permite cinco no
// máximo). Existe por duas lacunas concretas:
//
// 1. `useAuth().logout` estava implementado (auth-provider.tsx, e
//    `POST /auth/logout` no auth-client) e **nenhuma tela o chamava**: não
//    havia como sair da conta pelo app.
// 2. O §8 do guia pede override manual de claro/escuro em Configurações,
//    além de seguir o sistema — sem tela de configuração não havia onde.
//
// Quem é o usuário sai do próprio token (`decodeJwtPayload`), sem request
// nova: o payload traz os papéis e o plano do tenant, que é tudo o que
// esta tela mostra. Nome e e-mail não estão no token nem em `/settings` —
// por isso a identidade é o nome do app + os papéis, e não um perfil de
// pessoa; quando a API expuser o usuário, é aqui que entra.
//
// O rodapé "Powered by Orbien" segue o §6 do guia: fixo no Starter,
// removido no Premium. O plano vem de `plan` no token.
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../components/AppButton";
import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { useAuth } from "../../lib/auth/auth-provider";
import { decodeJwtPayload } from "../../lib/auth/jwt";
import { Bell, CircleUser, LogOut, Moon, Smartphone, Sun } from "../../lib/theme/icons";
import { useTheme, type ThemePreference } from "../../lib/theme/theme-provider";
import { radius, spacing, touchTarget, typography } from "../../lib/theme/tokens";

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Administrador",
  admin_congregation: "Admin. da congregação",
  pastor: "Pastor",
  secretary: "Secretaria",
  ministry_leader: "Líder de ministério",
  cell_leader: "Líder de célula",
  volunteer: "Voluntário",
  member: "Membro",
  platform_support: "Suporte da plataforma",
};

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Smartphone },
];

export default function PerfilScreen() {
  const { session, logout } = useAuth();
  const { appName, primaryColor, colors, preference, setPreference } = useTheme();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const payload = session ? decodeJwtPayload(session.accessToken) : null;
  const roles = payload?.roles ?? [];
  // Sem plano legível (token antigo, ou payload que não decodificou), o
  // default é atribuir: mostrar o rodapé a mais é preferível a esconder a
  // atribuição de um tenant Starter.
  const showPoweredBy = payload?.plan !== "premium";

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      // Sem `setSigningOut(false)` no sucesso de propósito: o
      // `Stack.Protected` do layout raiz desmonta esta tela assim que o
      // status vira "unauthenticated". Em falha, `logout` do auth-client é
      // best-effort e limpa o SecureStore de todo jeito, então o caminho é
      // o mesmo — o `finally` só cobre o caso de a tela sobreviver.
      setSigningOut(false);
    }
  }

  return (
    <Screen scroll testID="perfil-detail">
      <Card>
        <View style={styles.identity}>
          <Avatar icon={CircleUser} background={primaryColor} foreground={colors.textOnBrand} />
          <View style={styles.identityText}>
            <Text
              testID="perfil-app-name"
              style={[typography.h3, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {appName}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Minha conta</Text>
          </View>
        </View>
        {roles.length > 0 ? (
          <Text
            testID="perfil-roles"
            style={[typography.bodyMedium, styles.roles, { color: colors.textSecondary }]}
          >
            {roles.map((role) => ROLE_LABELS[role] ?? role).join(" · ")}
          </Text>
        ) : null}
      </Card>

      <View style={styles.section}>
        <SectionLabel>Aparência</SectionLabel>
        <Card>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = preference === value;
              return (
                <AppButton
                  key={value}
                  testID={`tema-${value}`}
                  title={label}
                  icon={Icon}
                  variant={active ? "primary" : "secondary"}
                  onPress={() => setPreference(value)}
                  style={styles.themeButton}
                />
              );
            })}
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Conta</SectionLabel>
        <Card>
          <AppButton
            testID="notificacoes-button"
            title="Notificações"
            icon={Bell}
            variant="ghost"
            onPress={() => router.push("/notificacoes")}
            style={styles.navRow}
          />
          <AppButton
            testID="logout-button"
            title="Sair da conta"
            icon={LogOut}
            variant="ghost"
            loading={signingOut}
            onPress={handleLogout}
            style={styles.logout}
          />
        </Card>
      </View>

      {showPoweredBy ? (
        <Text
          testID="powered-by"
          style={[typography.caption, styles.poweredBy, { color: colors.textTertiary }]}
        >
          Powered by Orbien
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identityText: { flex: 1 },
  roles: { marginTop: spacing.md },
  section: { marginTop: spacing.lg },
  themeRow: {
    flexDirection: "row",
    // 8px entre alvos de toque adjacentes (§3).
    gap: spacing.sm,
  },
  themeButton: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  navRow: {
    minHeight: touchTarget,
    borderRadius: radius.btn,
    alignSelf: "flex-start",
    paddingHorizontal: 0,
    marginBottom: spacing.sm,
  },
  logout: {
    minHeight: touchTarget,
    borderRadius: radius.btn,
    alignSelf: "flex-start",
    paddingHorizontal: 0,
  },
  // §6 do guia pede 10px; a escala do §2 fixa 11px como mínimo absoluto de
  // acessibilidade. Fica no token `caption` (11px), que é o menor que o
  // guia permite — a regra de legibilidade ganha da decorativa.
  poweredBy: {
    textAlign: "center",
    marginTop: spacing.xxl,
  },
});
