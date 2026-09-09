// Tab bar (MOB-06) — introduzida nesta rodada porque o segundo módulo de
// domínio (Conteúdo) justifica o custo, conforme já previsto no design.md
// da Rodada 2. `expo-router/js-tabs`, não `expo-router` (export
// deprecated) — ver AGENTS.md do mobile, Expo mudou entre versões.
// Terceira aba "Grupos" (MOB-09) — a ordem final entre módulos de domínio
// (Celebrações, do MOB-08, ainda não mesclado nesta branch) se resolve
// quando as branches convergirem.
import { Tabs } from "expo-router/js-tabs";

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Escala" }} />
      <Tabs.Screen name="grupos" options={{ title: "Grupos" }} />
      <Tabs.Screen name="conteudo" options={{ title: "Conteúdo" }} />
    </Tabs>
  );
}
