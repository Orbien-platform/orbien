// White-label ponta a ponta pelo ThemeProvider: o que uma tela vê quando a
// paleta do tenant muda de verdade (§6 e §8 do STYLE-GUIDE.md).
//
// O caso que motiva o arquivo é o `textOnBrand`: era branco fixo em
// `palettes`, então um tenant de cor clara ficava com CTA de texto branco
// sobre fundo claro. Aqui ele é derivado da cor resolvida.
import { Text } from "react-native";
import { act, render, screen, waitFor } from "@testing-library/react-native";

const mockGetItem = jest.fn();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: jest.fn(async () => undefined),
}));

const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

// A sessão é criada UMA vez, fora da fábrica: o efeito de branding do
// ThemeProvider depende de `[session]`, então devolver um objeto novo a
// cada chamada de `useAuth()` faz o efeito rodar a cada render — loop
// infinito, e o teste trava em vez de falhar.
// Prefixo `mock` é exigência do jest para a fábrica poder referenciá-la.
const mockSession = {
  accessToken: "t",
  refreshToken: "r",
  accessTokenExpiresAt: Date.now() + 900_000,
};
jest.mock("../auth/auth-provider", () => ({
  useAuth: () => ({ session: mockSession }),
}));

import { AA_CONTRAST, contrastRatio } from "./color";
import { brand } from "./tokens";
import { ThemeProvider, useTheme } from "./theme-provider";

function Probe() {
  const { primaryColor, accentColor, accentReadable, colors } = useTheme();
  return (
    <>
      <Text testID="primaryColor">{primaryColor}</Text>
      <Text testID="accentColor">{accentColor}</Text>
      <Text testID="accentReadable">{accentReadable}</Text>
      <Text testID="textOnBrand">{colors.textOnBrand}</Text>
    </>
  );
}

async function renderWithBranding(primaryColor: string | null) {
  mockGetItem.mockResolvedValue(null);
  mockAuthenticatedRequest.mockResolvedValue({
    branding: {
      app_name: "Igreja Teste",
      primary_color: primaryColor,
      logo_url: null,
      splash_url: null,
    },
  });

  await act(async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });

  await waitFor(() => {
    expect(mockAuthenticatedRequest).toHaveBeenCalled();
  });
}

describe("texto sobre a cor da marca", () => {
  beforeEach(() => jest.clearAllMocks());

  it("tenant de cor escura recebe texto claro sobre o CTA", async () => {
    await renderWithBranding("#1D4ED8");

    expect(screen.getByTestId("primaryColor").props.children).toBe("#1D4ED8");
    expect(screen.getByTestId("textOnBrand").props.children).toBe(brand.surface);
  });

  it("tenant de cor clara recebe texto escuro — era o caso ilegível", async () => {
    // Amarelo pastel: o exemplo que o §8 do guia dá como o que mais falha.
    await renderWithBranding("#FDE68A");

    expect(screen.getByTestId("textOnBrand").props.children).toBe(brand.ink);
  });

  // `it.each`, não um `for` dentro de um único teste: montar duas árvores
  // no mesmo teste deixa o `screen` apontando só para a última, o que
  // funciona por acidente e esconde qual caso falhou.
  it.each(["#1D4ED8", "#FDE68A", brand.navy])(
    "o par escolhido passa AA contra a cor do tenant (%s)",
    async (primary) => {
      await renderWithBranding(primary);

      const onBrand = screen.getByTestId("textOnBrand").props.children as string;
      expect(contrastRatio(onBrand, primary)).toBeGreaterThanOrEqual(AA_CONTRAST);
    },
  );

  it("sem cor customizada, o navy da plataforma segue com texto claro", async () => {
    await renderWithBranding(null);

    expect(screen.getByTestId("primaryColor").props.children).toBe(brand.navy);
    expect(screen.getByTestId("textOnBrand").props.children).toBe(brand.surface);
  });
});

describe("accentReadable — destaque sobre superfície", () => {
  beforeEach(() => jest.clearAllMocks());

  it("o teal da plataforma não passa AA sobre branco, então cai no primary", async () => {
    await renderWithBranding("#1D4ED8");

    expect(screen.getByTestId("accentColor").props.children).toBe(brand.teal);
    expect(screen.getByTestId("accentReadable").props.children).toBe("#1D4ED8");
  });

  it("o accent cru continua exposto — quem precisa da cor da marca a tem", async () => {
    await renderWithBranding(null);

    // accentColor é a verdade da marca; accentReadable é a versão segura
    // para ícone/label sobre superfície. Os dois existem de propósito.
    expect(screen.getByTestId("accentColor").props.children).toBe(brand.teal);
    expect(screen.getByTestId("accentReadable").props.children).not.toBe(brand.teal);
  });
});
