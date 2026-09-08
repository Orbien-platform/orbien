import { Redirect, Stack } from "expo-router";
import type { ReactNode } from "react";
import { Image, Text, View } from "react-native";

import { AuthProvider, useAuth } from "../lib/auth/auth-provider";
import { NotificationsProvider } from "../lib/notifications/notifications-provider";
import { ThemeProvider, useTheme } from "../lib/theme/theme-provider";

// Guarda de navegação (T14, MOB-01): enquanto a sessão hidrata, mostra
// splash; sem sessão, força redirect para /login; com sessão, libera o
// shell (envolvido pelo ThemeProvider — T16, MOB-03).
function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View testID="splash" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Carregando…</Text>
      </View>
    );
  }

  if (status === "unauthenticated") {
    return <Redirect href="/login" />;
  }

  return <>{children}</>;
}

// Shell autenticado (T16, MOB-03): aplica primaryColor/logoUrl do tenant no
// header do Expo Router — cor no `headerStyle`, logo (ou nome do app, sem
// logo customizado) no `headerTitle`. Placeholder de tabs por domínio fica
// para MOB-04+; esta task só cobre o wiring do tema.
function ThemedShell() {
  const theme = useTheme();

  return (
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
    />
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate>
        <NotificationsProvider>
          <ThemeProvider>
            <ThemedShell />
          </ThemeProvider>
        </NotificationsProvider>
      </AuthGate>
    </AuthProvider>
  );
}
