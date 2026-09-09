// Tab bar (MOB-06) — introduzida nesta rodada porque o segundo módulo de
// domínio (Conteúdo) justifica o custo, conforme já previsto no design.md
// da Rodada 2. `expo-router/js-tabs`, não `expo-router` (export
// deprecated) — ver AGENTS.md do mobile, Expo mudou entre versões.
// Terceira e quarta abas "Celebrações" (MOB-08) e "Grupos" (MOB-09), na
// ordem cronológica de entrega dos módulos de domínio.
import { Tabs } from "expo-router/js-tabs";

import { useTheme } from "../../lib/theme/theme-provider";
import { colors } from "../../lib/theme/tokens";

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primaryColor,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Escala" }} />
      <Tabs.Screen name="celebracoes" options={{ title: "Celebrações" }} />
      <Tabs.Screen name="grupos" options={{ title: "Grupos" }} />
      <Tabs.Screen name="conteudo" options={{ title: "Conteúdo" }} />
    </Tabs>
  );
}
