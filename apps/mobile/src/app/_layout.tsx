import { Stack } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";

import { AuthProvider, useAuth } from "../lib/auth/auth-provider";
import { NotificationsProvider } from "../lib/notifications/notifications-provider";
import { ThemeProvider, useTheme } from "../lib/theme/theme-provider";

// Shell autenticado (T16, MOB-03): aplica primaryColor/logoUrl do tenant no
// header do Expo Router — cor no `headerStyle`, logo (ou nome do app, sem
// logo customizado) no `headerTitle`.
//
// A guarda de navegação (T14, MOB-01) vive DENTRO deste navigator, via
// `Stack.Protected`, e não em volta dele. É o ponto do bug de boot no
// simulador (iPhone 17 Pro / iOS 26.5): a versão anterior trocava o
// `<Stack>` inteiro por um `<View>` de splash enquanto a sessão hidratava e
// por um `<Redirect href="/login">` quando não havia sessão. Com isso o
// layout raiz nunca renderizava navigator nenhum — e sem navigator montado o
// `Redirect` não navega (o `useFocusEffect` que ele usa por dentro não tem
// navegação para observar), então o app ficava em tela branca com o splash
// re-renderizando sem parar. A regra do expo-router é que o layout raiz
// renderize um navigator já no primeiro render, sempre; ver
// `src/__tests__/app/navigation-boot.test.tsx`.
function ThemedShell() {
  const { status } = useAuth();
  const theme = useTheme();
  const isAuthenticated = status === "authenticated";

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.primaryColor },
          headerTintColor: "#fff",
          headerTitle: () =>
            theme.logoUrl ? (
              <Image
                testID="header-logo"
                source={{ uri: theme.logoUrl }}
                style={{ width: 32, height: 32 }}
              />
            ) : (
              <Text testID="header-app-name">{theme.appName}</Text>
            ),
        }}
      >
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="indisponibilidade" />
          <Stack.Screen name="post/[id]" />
        </Stack.Protected>
        {/* Enquanto `status` é "loading" as rotas autenticadas ainda não
            existem; o splash cobre a tela até a sessão resolver, e o
            `Stack.Protected` faz a troca sozinho quando ela resolve. */}
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      {status === "loading" ? (
        <View testID="splash" style={styles.splash}>
          <Text>Carregando…</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <ThemeProvider>
          <ThemedShell />
        </ThemeProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
}
