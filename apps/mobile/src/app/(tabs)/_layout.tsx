// Tab bar (MOB-06) — introduzida nesta rodada porque o segundo módulo de
// domínio (Conteúdo) justifica o custo, conforme já previsto no design.md
// da Rodada 2. `expo-router/js-tabs`, não `expo-router` (export
// deprecated) — ver AGENTS.md do mobile, Expo mudou entre versões.
import { Tabs } from "expo-router/js-tabs";

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Escala" }} />
      <Tabs.Screen name="conteudo" options={{ title: "Conteúdo" }} />
    </Tabs>
  );
}
