import { Redirect, Stack } from "expo-router";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { AuthProvider, useAuth } from "../lib/auth/auth-provider";

// Guarda de navegação (T14, MOB-01): enquanto a sessão hidrata, mostra
// splash; sem sessão, força redirect para /login; com sessão, libera o
// shell (placeholder de tabs — telas de domínio ficam para MOB-04+).
// ThemeProvider entra em fase posterior (T15/T16).
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

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate>
        <Stack />
      </AuthGate>
    </AuthProvider>
  );
}
