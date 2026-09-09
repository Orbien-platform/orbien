import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect } from "react";
import { Image, Text } from "react-native";

import { AuthProvider, useAuth } from "../lib/auth/auth-provider";
import { NotificationsProvider } from "../lib/notifications/notifications-provider";
import { AnimatedSplash } from "../lib/splash/animated-splash";
import { ThemeProvider, useTheme } from "../lib/theme/theme-provider";

// Escopo de módulo, sem await: a doc do expo-splash-screen é explícita de
// que dentro de componente/hook isso roda tarde demais — a splash nativa já
// teria sumido, e o app piscaria branco antes da splash animada aparecer.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Só acontece se a splash já tiver sido escondida; não é motivo para
  // derrubar o boot.
});
SplashScreen.setOptions({ duration: 300, fade: true });

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
//
// Enquanto `status` é "loading", a `AnimatedSplash` cobre o navigator —
// continuando a splash nativa, que só é escondida quando ela já desenhou.
function ThemedShell() {
  const { status } = useAuth();
  const theme = useTheme();
  const isAuthenticated = status === "authenticated";

  // A splash nativa some quando a animada já está desenhada — daí o
  // `onLayout`, e não um efeito de mount: no layout o primeiro frame do JS
  // já existe, então a troca é entre duas telas iguais.
  const hideNativeSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {
      // Já escondida (ex.: segundo layout) — nada a fazer.
    });
  }, []);

  // Rede de segurança: se a sessão resolver antes da splash animada montar,
  // ninguém teria chamado `hideAsync` e a nativa ficaria para sempre.
  useEffect(() => {
    if (status !== "loading") hideNativeSplash();
  }, [status, hideNativeSplash]);

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
        {/* Toda rota autenticada precisa estar listada aqui: o que o
            `Stack.Protected` não nomeia continua sempre montado, ou seja,
            alcançável por deep link sem sessão. Rota nova sob `src/app/`
            entra nesta lista junto com o arquivo. */}
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="indisponibilidade" />
          <Stack.Screen name="post/[id]" />
          <Stack.Screen name="celebracao/[id]" />
        </Stack.Protected>
        {/* Enquanto `status` é "loading" as rotas autenticadas ainda não
            existem; o splash cobre a tela até a sessão resolver, e o
            `Stack.Protected` faz a troca sozinho quando ela resolve. */}
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      {status === "loading" ? <AnimatedSplash onReady={hideNativeSplash} /> : null}
    </>
  );
}

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
