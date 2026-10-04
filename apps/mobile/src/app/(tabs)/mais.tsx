// Aba Mais (v2, `MaisScreen` em docs/design/orbita-v2/produto/proto/app-shell.jsx).
//
// É a porta das pilhas que não cabem na tab bar: Minhas escalas,
// Celebrações, Contribuir, Notificações e Perfil — e, para a liderança, o
// cadastro de visitante. "Privacidade e meus dados" abre os direitos do
// titular da LGPD (`CONF-03`), para qualquer papel.
//
// Cada linha aparece só para quem pode usá-la (README da v2, "Papéis":
// esconder a ação que o papel não pode fazer):
//
// - Escalas e Celebrações seguem a área `volunteers` de `GET /me/permissions`,
//   o mesmo gate que a Home já usava (fail-open enquanto `areas` é `null`,
//   porque quem nega de verdade é a API em cada rota);
// - Cadastrar visitante segue os papéis que `POST /visitors` aceita
//   (`VISITOR_LEADER_ROLES` em apps/api/src/visitor/visitor.leader.controller.ts),
//   o líder de célula incluso. Aqui o gate é fail-closed: sem papel legível
//   no token, a linha não aparece;
// - Dízimo automático só com a trava `ASAAS_PAYMENTS_ENABLED` ligada e
//   tenant Premium (PROD-28), como na Home.
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "../../components/Avatar";
import { Card } from "../../components/Card";
import { ListGroup, type ListGroupItem } from "../../components/ListGroup";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { useAuth } from "../../lib/auth/auth-provider";
import { decodeJwtPayload } from "../../lib/auth/jwt";
import { roleLabel } from "../../lib/auth/roles";
import { fetchAsaasPaymentsEnabled } from "../../lib/pix-recorrente/pix-recorrente-client";
import {
  Bell,
  CalendarCheck,
  ChevronRight,
  Church,
  CircleUser,
  HandHeart,
  LogOut,
  ShieldCheck,
  UserPlus,
} from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

/** Quem `POST /visitors` aceita — espelho de `VISITOR_LEADER_ROLES` da API. */
export const VISITOR_WRITE_ROLES = [
  "tenant_admin",
  "admin_congregation",
  "pastor",
  "secretary",
  "cell_leader",
];

export default function MaisScreen() {
  const router = useRouter();
  const { session, areas, logout } = useAuth();
  const { appName, primaryColor, colors, tenantSlug } = useTheme();
  const [asaasPaymentsEnabled, setAsaasPaymentsEnabled] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const payload = session ? decodeJwtPayload(session.accessToken) : null;
  const roles = payload?.roles ?? [];
  const isPremium = payload?.plan === "premium";
  const canServe = areas === null || areas.includes("volunteers");
  const canRegisterVisitor = roles.some((role) => VISITOR_WRITE_ROLES.includes(role));
  const webUrl = Constants.expoConfig?.extra?.webUrl as string | undefined;

  useEffect(() => {
    let cancelled = false;
    fetchAsaasPaymentsEnabled().then((enabled) => {
      if (!cancelled) setAsaasPaymentsEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      // Em sucesso o `Stack.Protected` desmonta a tela; o `finally` só cobre
      // o caso de ela sobreviver (ver o mesmo comentário em perfil.tsx).
      setSigningOut(false);
    }
  }

  const main: ListGroupItem[] = [
    ...(canServe
      ? [
          {
            key: "escalas",
            testID: "mais-escalas",
            label: "Minhas escalas",
            sub: "Próximas, trocas e indisponibilidade",
            icon: CalendarCheck,
            onPress: () => router.push("/escala"),
          },
          {
            key: "celebracoes",
            testID: "mais-celebracoes",
            label: "Celebrações",
            sub: "Ordem de culto e setlist",
            icon: Church,
            onPress: () => router.push("/celebracoes"),
          },
        ]
      : []),
    ...(tenantSlug && webUrl
      ? [
          {
            key: "contribuir",
            testID: "mais-contribuir",
            label: "Contribuir",
            sub: "Dízimo, oferta e missões",
            icon: HandHeart,
            onPress: () => {
              WebBrowser.openBrowserAsync(`${webUrl}/doar/${tenantSlug}`).catch(() => {
                // sem navegador disponível: nada bloqueante, mesmo padrão da Home.
              });
            },
          },
        ]
      : []),
    ...(asaasPaymentsEnabled && isPremium
      ? [
          {
            key: "dizimo-automatico",
            testID: "mais-dizimo-automatico",
            label: "Dízimo automático",
            sub: "Contribuição recorrente por PIX",
            icon: HandHeart,
            onPress: () => router.push("/dizimo-automatico"),
          },
        ]
      : []),
    {
      key: "notificacoes",
      testID: "mais-notificacoes",
      label: "Notificações",
      sub: "Central e preferências",
      icon: Bell,
      onPress: () => router.push("/notificacoes"),
    },
  ];

  const leadership: ListGroupItem[] = canRegisterVisitor
    ? [
        {
          key: "visitante",
          testID: "mais-visitante",
          label: "Cadastrar visitante",
          sub: "Quem chegou hoje",
          icon: UserPlus,
          onPress: () => router.push("/visitante"),
        },
      ]
    : [];

  const account: ListGroupItem[] = [
    {
      key: "privacidade",
      testID: "mais-privacidade",
      label: "Privacidade e meus dados",
      icon: ShieldCheck,
      onPress: () => router.push("/privacidade"),
    },
    {
      key: "sair",
      testID: "mais-sair",
      label: signingOut ? "Saindo…" : "Sair",
      icon: LogOut,
      danger: true,
      onPress: handleLogout,
    },
  ];

  return (
    <Screen scroll testID="mais-screen">
      <Text style={[typography.h1, styles.title, { color: colors.textPrimary }]}>Mais</Text>

      <Card
        testID="mais-perfil"
        onPress={() => router.push("/perfil")}
        accessibilityLabel="Meu perfil"
      >
        <View style={styles.identity}>
          <Avatar icon={CircleUser} background={primaryColor} foreground={colors.textOnBrand} />
          <View style={styles.identityText}>
            <Text style={[typography.h3, { color: colors.textPrimary }]} numberOfLines={1}>
              Meu perfil
            </Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
              {[roles.map(roleLabel).join(", "), appName].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <ChevronRight
            size={iconSize.inline}
            color={colors.textTertiary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
        </View>
      </Card>

      <View style={styles.section}>
        <ListGroup testID="mais-main" items={main} />
      </View>

      {leadership.length > 0 ? (
        <View>
          <SectionLabel>Liderança</SectionLabel>
          <ListGroup testID="mais-lideranca" items={leadership} />
        </View>
      ) : null}

      <ListGroup testID="mais-conta" items={account} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  identityText: { flex: 1 },
  section: { marginTop: spacing.sm },
});
