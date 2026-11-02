// Tela "Contribuir" (PROD-31, variante Starter): categoria (da lista da
// igreja), valor e identificação viram a doação pública; o resultado devolve o código PIX
// para copiar. Falha mantém os campos.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));

const mockSetString = jest.fn();
jest.mock("expo-clipboard", () => ({
  setStringAsync: (...args: unknown[]) => mockSetString(...args),
}));

const mockCreate = jest.fn();
const mockCategories = jest.fn();
const mockInvalidate = jest.fn();
jest.mock("../../lib/contribuir/contribuir-client", () => {
  const actual = jest.requireActual("../../lib/contribuir/contribuir-client");
  return {
    ...actual,
    createDonation: (...args: unknown[]) => mockCreate(...args),
    fetchDonationCategories: (...args: unknown[]) => mockCategories(...args),
    invalidateDonationCategories: (...args: unknown[]) => mockInvalidate(...args),
  };
});

const mockUseTheme = jest.fn();
jest.mock("../../lib/theme/theme-provider", () => ({ useTheme: () => mockUseTheme() }));

import ContribuirScreen from "../../app/contribuir";
import { HttpError, NetworkError } from "../../lib/api/errors";
import { palettes } from "../../lib/theme/tokens";

const CATEGORIES = [
  { id: "cat-dizimo", name: "Dízimo", description: null },
  { id: "cat-oferta", name: "Oferta", description: null },
  { id: "cat-missoes", name: "Oferta Missionária", description: "Missões" },
];

const RESULT = {
  mode: "static" as const,
  pix_key: "igreja@pix.com",
  amount: 150,
  church_name: "Igreja Teste",
  transaction_ref: "REF-1",
};

async function renderScreen() {
  await act(async () => {
    render(<ContribuirScreen />);
  });
}

async function fill(amount: string) {
  await fireEvent.changeText(screen.getByTestId("contribuir-valor-input"), amount);
}

async function submit() {
  await act(async () => {
    await fireEvent.press(screen.getByTestId("contribuir-enviar"));
  });
}

describe("ContribuirScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTheme.mockReturnValue({
      tenantSlug: "igreja-teste",
      primaryColor: "#1E3A7B",
      brandInk: "#1E3A7B",
      shadow: { sm: {}, md: {}, lg: {} },
      colors: palettes.dark,
    });
    mockCreate.mockResolvedValue(RESULT);
    mockCategories.mockResolvedValue(CATEGORIES);
    mockSetString.mockResolvedValue(undefined);
  });

  it("busca as categorias da igreja pelo slug e pré-seleciona a primeira", async () => {
    await renderScreen();

    expect(mockCategories).toHaveBeenCalledWith("igreja-teste");
    expect(screen.getByText("Oferta Missionária")).toBeTruthy();
    await fill("20");
    await submit();
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-dizimo" }));
  });

  it("enquanto carrega as categorias, o botão espera", async () => {
    mockCategories.mockReturnValue(new Promise(() => undefined));
    await renderScreen();
    await fill("20");

    expect(screen.getByTestId("contribuir-categorias-carregando")).toBeTruthy();
    await submit();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sem conexão ao carregar: explica, não deixa enviar e tenta de novo pelo botão", async () => {
    mockCategories.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    await fill("20");

    expect(screen.getByTestId("contribuir-categorias-erro")).toBeTruthy();
    expect(screen.getByText(/Verifique sua conexão/)).toBeTruthy();
    await submit();
    expect(mockCreate).not.toHaveBeenCalled();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("contribuir-categorias-tentar"));
    });

    expect(mockCategories).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("contribuir-categorias-erro")).toBeNull();
    expect(screen.getByTestId("contribuir-valor-input").props.value).toBe("20");
    await submit();
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-dizimo" }));
  });

  it("igreja sem categorias avisa e deixa doar sem categoria", async () => {
    mockCategories.mockResolvedValue([]);
    await renderScreen();

    expect(screen.getByTestId("contribuir-categorias-vazia")).toBeTruthy();
    await fill("20");
    await submit();
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ categoryId: undefined }));
  });

  it("categoria que a API recusou: recarrega a lista e pede para escolher de novo", async () => {
    mockCreate.mockRejectedValue(new HttpError(400, { message: "Categoria inválida" }));
    await renderScreen();
    await fill("20");
    await submit();

    expect(mockInvalidate).toHaveBeenCalledWith("igreja-teste");
    expect(mockCategories).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/categorias da igreja mudaram/)).toBeTruthy();
    expect(screen.getByTestId("contribuir-valor-input").props.value).toBe("20");
  });

  it("sem valor o botão não envia", async () => {
    await renderScreen();
    await submit();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("valor fora dos limites mostra o erro e não envia", async () => {
    await renderScreen();
    await fill("2");
    expect(screen.getByTestId("contribuir-valor-erro")).toBeTruthy();
    await submit();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("anônima por padrão: envia categoria e valor, sem nome", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId("contribuir-categoria-cat-oferta"));
    await fill("150,00");
    await submit();

    expect(mockCreate).toHaveBeenCalledWith({
      tenantSlug: "igreja-teste",
      amount: 150,
      categoryId: "cat-oferta",
      donorName: undefined,
    });
    expect(screen.getByTestId("contribuir-valor")).toBeTruthy();
  });

  it("identificada pede e envia o nome", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId("contribuir-identidade-named"));
    await fireEvent.changeText(screen.getByTestId("contribuir-nome"), "Ana");
    await fill("50");
    await submit();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "cat-dizimo", amount: 50, donorName: "Ana" }),
    );
  });

  it("identificada sem nome não envia", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId("contribuir-identidade-named"));
    await fill("50");
    await submit();

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("copia o código PIX e confirma na tela", async () => {
    await renderScreen();
    await fill("150");
    await submit();
    await act(async () => {
      await fireEvent.press(screen.getByTestId("contribuir-copiar"));
    });

    expect(mockSetString).toHaveBeenCalledWith("igreja@pix.com");
    expect(screen.getByText("Código copiado")).toBeTruthy();
  });

  it("falha ao copiar avisa e mantém o código na tela", async () => {
    mockSetString.mockRejectedValue(new Error("x"));
    await renderScreen();
    await fill("150");
    await submit();
    await act(async () => {
      await fireEvent.press(screen.getByTestId("contribuir-copiar"));
    });

    expect(screen.getByTestId("contribuir-copy-erro")).toBeTruthy();
    expect(screen.getByTestId("contribuir-codigo")).toBeTruthy();
  });

  it("sem conexão mantém o formulário e os dados", async () => {
    mockCreate.mockRejectedValue(new NetworkError());
    await renderScreen();
    await fill("150");
    await submit();

    expect(screen.getByTestId("contribuir-erro")).toBeTruthy();
    expect(screen.getByTestId("contribuir-valor-input").props.value).toBe("150");
  });

  it("429 pede para aguardar", async () => {
    mockCreate.mockRejectedValue(new HttpError(429, {}));
    await renderScreen();
    await fill("150");
    await submit();

    expect(screen.getByText(/Aguarde um minuto/)).toBeTruthy();
  });

  it("400 mostra a mensagem que a API devolveu", async () => {
    mockCreate.mockRejectedValue(new HttpError(400, { message: "O valor mínimo da doação é R$ 5,00" }));
    await renderScreen();
    await fill("150");
    await submit();

    expect(screen.getByText("O valor mínimo da doação é R$ 5,00")).toBeTruthy();
  });

  it("404 aponta a chave PIX da igreja, não o login, e mantém o formulário", async () => {
    mockCreate.mockRejectedValue(new HttpError(404, {}));
    await renderScreen();
    await fill("150");
    await submit();

    expect(screen.getByText(/chave PIX cadastrada/)).toBeTruthy();
    expect(screen.queryByText(/entre de novo/)).toBeNull();
    expect(screen.getByTestId("contribuir-valor-input").props.value).toBe("150");
  });

  it("erro inesperado cai na mensagem genérica, sem número de status", async () => {
    mockCreate.mockRejectedValue(new HttpError(500, {}));
    await renderScreen();
    await fill("150");
    await submit();

    expect(screen.getByText(/Não foi possível gerar a contribuição/)).toBeTruthy();
    expect(screen.queryByText(/500/)).toBeNull();
  });

  it("Concluir fecha a tela", async () => {
    await renderScreen();
    await fill("150");
    await submit();
    await fireEvent.press(screen.getByTestId("contribuir-concluir"));

    expect(mockBack).toHaveBeenCalled();
  });

  it("fazer outra contribuição volta ao formulário vazio", async () => {
    await renderScreen();
    await fill("150");
    await submit();
    await fireEvent.press(screen.getByTestId("contribuir-outra"));

    expect(screen.getByTestId("contribuir-valor-input").props.value).toBe("");
  });

  it("sem slug da igreja não oferece o formulário", async () => {
    mockUseTheme.mockReturnValue({
      tenantSlug: null,
      colors: palettes.dark,
      primaryColor: "#000",
      shadow: { sm: {}, md: {}, lg: {} },
    });
    await renderScreen();
    expect(screen.getByTestId("contribuir-sem-igreja")).toBeTruthy();
  });
});
