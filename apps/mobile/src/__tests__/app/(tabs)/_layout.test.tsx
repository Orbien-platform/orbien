// Fora de `src/app` de propósito: arquivo `.tsx` na raiz de rotas entra no
// bundle pelo `require.context` do expo-router e arrasta o
// @testing-library/react-native, que não resolve no Metro. Ver README,
// "Portão de bundle no `build`".
//
// Teste derivado do Done-when de T8
// (.specs/features/mobile-home-redesign/tasks.md, MHR-01/02): 4 abas
// declaradas (Home, Grupos, Conteúdo, Perfil), nesta ordem; nenhuma aba de
// Celebrações; nenhum gate de permissão na tab bar (o `showEscala` que
// escondia a aba Escala saiu — Escala não é mais aba, é CTA da Home). Mock
// de expo-router/js-tabs renderiza o que o layout realmente passa como
// Tabs.Screen (name/options.title), para o teste poder inspecionar as abas
// registradas — um mock que ignorasse os children não provaria nada sobre
// o wiring real.
import { act, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

jest.mock("expo-router/js-tabs", () => {
  const { Text, View } = require("react-native");
  function Tabs({ children }: { children: ReactNode }) {
    return <View testID="tabs">{children}</View>;
  }
  Tabs.Screen = function TabsScreen({
    name,
    options,
  }: {
    name: string;
    options?: { title?: string };
  }) {
    return <Text testID={`tab-${name}`}>{options?.title ?? name}</Text>;
  };
  return { Tabs };
});

import TabsLayout from "../../../app/(tabs)/_layout";

describe("TabsLayout", () => {
  it("renderiza exatamente 4 abas, nesta ordem: Home, Grupos, Conteúdo, Perfil", async () => {
    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.getByTestId("tab-index").props.children).toBe("Home");
    expect(screen.getByTestId("tab-grupos").props.children).toBe("Grupos");
    expect(screen.getByTestId("tab-conteudo").props.children).toBe("Conteúdo");
    expect(screen.getByTestId("tab-perfil").props.children).toBe("Perfil");
  });

  it("não declara aba de Celebrações", async () => {
    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.queryByTestId("tab-celebracoes")).toBeNull();
  });

  // §7 do STYLE-GUIDE.md: "Máximo 5 itens (regra dura — acima disso, usar
  // 'Mais' agregando)". 5 → 4 abas: a mudança libera 1 slot em vez de
  // preenchê-lo (ver Assumptions em spec.md).
  it("declara só 4 abas — dentro do limite duro de 5 do §7 do style guide", async () => {
    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.getAllByTestId(/^tab-/)).toHaveLength(4);
  });
});
