// Fora de `src/app` de propósito: arquivo `.tsx` na raiz de rotas entra no
// bundle pelo `require.context` do expo-router e arrasta o
// @testing-library/react-native, que não resolve no Metro. Ver README,
// "Portão de bundle no `build`".
//
// Navegação da v2 (docs/design/orbita-v2/README.md, "App mobile:
// navegação"): 5 abas — Início, Conteúdo, Bíblia, {termo}, Mais — nesta
// ordem, sem aba de Celebrações nem de Perfil (são pilhas abertas pela
// Mais). O {termo} vem da igreja (`group_term_plural`). Mock de
// expo-router/js-tabs renderiza o que o layout realmente passa como
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

const mockGroupTerm = { current: { singular: "Grupo", plural: "Grupos" } };
jest.mock("../../../lib/theme/terminology", () => ({
  useGroupTerm: () => mockGroupTerm.current,
}));

import TabsLayout from "../../../app/(tabs)/_layout";

describe("TabsLayout", () => {
  beforeEach(() => {
    mockGroupTerm.current = { singular: "Grupo", plural: "Grupos" };
  });

  it("renderiza 5 abas, nesta ordem: Início, Conteúdo, Bíblia, Grupos, Mais", async () => {
    await act(async () => {
      render(<TabsLayout />);
    });

    const tabs = screen.getAllByTestId(/^tab-/).map((node) => node.props.testID);
    expect(tabs).toEqual(["tab-index", "tab-conteudo", "tab-biblia", "tab-grupos", "tab-mais"]);
    expect(screen.getByTestId("tab-index").props.children).toBe("Início");
    expect(screen.getByTestId("tab-conteudo").props.children).toBe("Conteúdo");
    expect(screen.getByTestId("tab-biblia").props.children).toBe("Bíblia");
    expect(screen.getByTestId("tab-grupos").props.children).toBe("Grupos");
    expect(screen.getByTestId("tab-mais").props.children).toBe("Mais");
  });

  it("a aba de grupos usa o termo da igreja", async () => {
    mockGroupTerm.current = { singular: "Célula", plural: "Células" };
    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.getByTestId("tab-grupos").props.children).toBe("Células");
  });

  it("não declara aba de Celebrações nem de Perfil", async () => {
    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.queryByTestId("tab-celebracoes")).toBeNull();
    expect(screen.queryByTestId("tab-perfil")).toBeNull();
  });
});
