// Fora de `src/app` de propósito: arquivo `.tsx` na raiz de rotas entra no
// bundle pelo `require.context` do expo-router e arrasta o
// @testing-library/react-native, que não resolve no Metro. Ver README,
// "Portão de bundle no `build`".
// Teste derivado do Done-when de R3-T1 (tasks.md): renderiza as 2 abas
// (Escala, Conteúdo). Mock de expo-router/js-tabs renderiza o que o
// layout realmente passa como Tabs.Screen (name/options.title/options.href),
// para o teste poder inspecionar as abas registradas — um mock que ignorasse
// os children não provaria nada sobre o wiring real.
//
// `href: null` (ACC-07, restricao-acesso-piso-member) tira a aba da tab bar
// sem remover a rota do navigator: o mock reflete isso com um testID
// diferente (`hidden-tab-<name>` em vez de `tab-<name>`) para o teste
// distinguir "declarada" de "visível".
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
    options?: { title?: string; href?: unknown };
  }) {
    const hidden = options?.href === null;
    return (
      <Text testID={hidden ? `hidden-tab-${name}` : `tab-${name}`}>
        {options?.title ?? name}
      </Text>
    );
  };
  return { Tabs };
});

const mockUseAuth = jest.fn();
jest.mock("../../../lib/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

import TabsLayout from "../../../app/(tabs)/_layout";

describe("TabsLayout", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ areas: null });
  });

  it("renderiza as abas Escala, Celebrações, Grupos, Conteúdo e Perfil quando areas é null (fail-open)", async () => {
    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.getByTestId("tab-index").props.children).toBe("Escala");
    expect(screen.getByTestId("tab-celebracoes").props.children).toBe("Celebrações");
    expect(screen.getByTestId("tab-grupos").props.children).toBe("Grupos");
    expect(screen.getByTestId("tab-conteudo").props.children).toBe("Conteúdo");
    expect(screen.getByTestId("tab-perfil").props.children).toBe("Perfil");
  });

  it("mostra a aba Escala quando areas inclui volunteers", async () => {
    mockUseAuth.mockReturnValue({ areas: ["volunteers", "content"] });

    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.getByTestId("tab-index")).toBeTruthy();
    expect(screen.queryByTestId("hidden-tab-index")).toBeNull();
  });

  it("esconde a aba Escala (sem removê-la do navigator) quando areas não inclui volunteers", async () => {
    mockUseAuth.mockReturnValue({ areas: ["content"] });

    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.queryByTestId("tab-index")).toBeNull();
    expect(screen.getByTestId("hidden-tab-index").props.children).toBe("Escala");
    // As outras 4 continuam visíveis normalmente.
    expect(screen.getByTestId("tab-celebracoes")).toBeTruthy();
    expect(screen.getByTestId("tab-grupos")).toBeTruthy();
    expect(screen.getByTestId("tab-conteudo")).toBeTruthy();
    expect(screen.getByTestId("tab-perfil")).toBeTruthy();
  });

  // §7 do STYLE-GUIDE.md: "Máximo 5 itens (regra dura — acima disso, usar
  // 'Mais' agregando)". Conta rotas DECLARADAS (visíveis + escondidas por
  // `href: null`), não só as visíveis — esconder uma aba não deveria
  // permitir declarar uma sexta rota por engano.
  it("não passa de 5 abas declaradas (limite duro do §7 do style guide)", async () => {
    mockUseAuth.mockReturnValue({ areas: ["content"] }); // Escala escondida

    await act(async () => {
      render(<TabsLayout />);
    });

    expect(screen.getAllByTestId(/^(tab-|hidden-tab-)/)).toHaveLength(5);
  });
});
