import { Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect } from "react";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../lib/auth/auth-provider";
import { NotificationsProvider } from "../lib/notifications/notifications-provider";
import { AnimatedSplash } from "../lib/splash/animated-splash";
import { useAppFonts } from "../lib/theme/fonts";
import { ThemeProvider, useTheme } from "../lib/theme/theme-provider";
import { typography } from "../lib/theme/tokens";

// Escopo de módulo, sem await: a doc do expo-splash-screen é explícita de
// que dentro de componente/hook isso roda tarde demais — a splash nativa já
// teria sumido, e o app piscaria branco antes da splash animada aparecer.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Só acontece se a splash já tiver sido escondida; não é motivo para
  // derrubar o boot.
});
SplashScreen.setOptions({ duration: 300, fade: true });

// Shell autenticado (T16, MOB-03): aplica primaryColor do tenant no header
// do Expo Router.
//
// O header é das telas de DETALHE, não das abas (`headerShown: false` em
// `(tabs)`): a barra repetia a marca em toda tela e cobrava 56px + safe
// area por isso, enquanto a tab bar já diz onde o usuário está. A
// identidade (logo do tenant ou marca da Orbien) aparece uma vez, no topo
// do conteúdo da primeira aba (`BrandHeader`). Nas telas de detalhe o
// header carrega o que só ele pode carregar: voltar e o nome da tela.
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
// A `AnimatedSplash` cobre o navigator enquanto a sessão hidrata **ou** as
// fontes da marca carregam (§1 do STYLE-GUIDE.md: nunca deixar o app
// piscar com a fonte do sistema). A splash nativa só é escondida quando a
// animada já desenhou.
function ThemedShell() {
  const { status } = useAuth();
  const theme = useTheme();
  const fontsReady = useAppFonts();
  const segments = useSegments();
  const isAuthenticated = status === "authenticated";
  const isBooting = status === "loading" || !fontsReady;
  // Só as telas de detalhe desenham o header pintado com a cor da marca; as
  // abas e o login mostram a status bar sobre `bgBase`.
  const onBrandHeader = isAuthenticated && segments.length > 0 && segments[0] !== "(tabs)";

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
    if (!isBooting) hideNativeSplash();
  }, [isBooting, hideNativeSplash]);

  return (
    <>
      {/* §8 do guia. Sob o header pintado com a cor da marca (escura) a
          status bar é sempre clara, nos dois modos; nas abas e no login,
          que rodam sem header, ela fica sobre `bgBase` e segue o modo
          ativo — no claro, `light` deixaria a hora invisível. */}
      <StatusBar style={onBrandHeader || theme.isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.primaryColor },
          headerTintColor: theme.colors.textOnBrand,
          headerTitleAlign: "center",
          // A sombra padrão do header desenha uma linha cinza sobre a cor
          // da marca — some com ela e deixa o contraste do fundo separar.
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.bgBase },
          // O título é o nome da TELA, não a marca (que já aparece no topo
          // da primeira aba). Sem `headerTitle` customizado o Expo Router
          // usa o `title` de cada `Stack.Screen` abaixo.
          headerTitleStyle: {
            fontFamily: typography.h3.fontFamily,
            fontSize: typography.h3.fontSize,
          },
          // Sem isto o iOS escreve o nome da rota anterior ao lado da seta
          // — e a rota anterior é o grupo de abas, então o botão de voltar
          // do detalhe aparecia como "(tabs)".
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        {/* Toda rota autenticada precisa estar listada aqui: o que o
            `Stack.Protected` não nomeia continua sempre montado, ou seja,
            alcançável por deep link sem sessão. Rota nova sob `src/app/`
            entra nesta lista junto com o arquivo. */}
        <Stack.Protected guard={isAuthenticated}>
          {/* As abas não têm header: a tab bar já identifica a tela, e a
              barra só tiraria espaço útil. */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="indisponibilidade" options={{ title: "Indisponibilidade" }} />
          <Stack.Screen name="notificacoes" options={{ title: "Notificações" }} />
          <Stack.Screen name="post/[id]" options={{ title: "Publicação" }} />
          <Stack.Screen name="celebracao/[id]" options={{ title: "Ordem de Culto" }} />
          <Stack.Screen name="grupo/[id]" options={{ title: "Grupo" }} />
          <Stack.Screen name="grupo/encontro/[id]" options={{ title: "Encontro" }} />
          <Stack.Screen name="grupo/encontro/[id]/presenca" options={{ title: "Presença" }} />
        </Stack.Protected>
        {/* Enquanto `status` é "loading" as rotas autenticadas ainda não
            existem; o splash cobre a tela até a sessão resolver, e o
            `Stack.Protected` faz a troca sozinho quando ela resolve. */}
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      {isBooting ? <AnimatedSplash onReady={hideNativeSplash} /> : null}
    </>
  );
}

export default function RootLayout() {
  return (
    // `initialMetrics` evita o frame de insets zerados no boot: sem isso o
    // primeiro desenho ignora a safe area e o conteúdo pula quando ela
    // chega (§3 do guia manda usar o inset, nunca valor fixo).
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <NotificationsProvider>
          <ThemeProvider>
            <ThemedShell />
          </ThemeProvider>
        </NotificationsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
