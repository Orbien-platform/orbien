import { Stack } from "expo-router";

// Root layout do Expo Router. Guarda de autenticação e ThemeProvider entram
// aqui em fases posteriores (T12+) — por ora só monta a stack de navegação.
export default function RootLayout() {
  return <Stack />;
}
