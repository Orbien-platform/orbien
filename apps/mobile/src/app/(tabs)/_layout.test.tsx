// Teste derivado do Done-when de R3-T1 (tasks.md): renderiza as 2 abas
// (Escala, Conteúdo). Mock de expo-router/js-tabs renderiza o que o
// layout realmente passa como Tabs.Screen (name/options.title), para o
// teste poder inspecionar as abas registradas — um mock que ignorasse os
// children não provaria nada sobre o wiring real.
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

import TabsLayout from "./_layout";

describe("TabsLayout", () => {
  it("renderiza as abas Escala e Conteúdo", async () => {
    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.getByTestId("tab-index").props.children).toBe("Escala");
    expect(screen.getByTestId("tab-conteudo").props.children).toBe("Conteúdo");
  });
});
