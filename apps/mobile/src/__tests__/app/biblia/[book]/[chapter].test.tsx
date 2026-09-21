// Testes derivados do Done-when de T19 (tasks.md, biblia-nvi-marcacoes-mobile,
// BIB-01/BIB-02/BIB-03/BIB-04): sucesso (versículos numerados), erro de
// rede com retry, seleção de intervalo tocando no 1º e no último versículo,
// CTA "Comentar" habilita só com intervalo completo.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

let mockSearchParams: { book: string; chapter: string } = { book: "JHN", chapter: "3" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
}));

const mockGetChapter = jest.fn();
jest.mock("../../../../lib/bible/bible-client", () => ({
  getChapter: (...args: unknown[]) => mockGetChapter(...args),
}));

import { NetworkError } from "../../../../lib/api/errors";
import BibliaChapterScreen from "../../../../app/biblia/[book]/[chapter]";

const CHAPTER = {
  book_code: "JHN",
  chapter: 3,
  verses: [
    { number: 1, text: "Havia um fariseu chamado Nicodemos." },
    { number: 2, text: "Este veio a Jesus, de noite." },
    { number: 3, text: "Jesus lhe respondeu." },
  ],
};

describe("BibliaChapterScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { book: "JHN", chapter: "3" };
  });

  it("busca o capítulo pelos parâmetros da rota e renderiza os versículos numerados", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);

    await act(async () => {
      render(<BibliaChapterScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-verse-1")).toBeTruthy();
    });
    expect(mockGetChapter).toHaveBeenCalledWith("JHN", 3);
    expect(screen.getByText("Havia um fariseu chamado Nicodemos.")).toBeTruthy();
    expect(screen.getByTestId("biblia-verse-2")).toBeTruthy();
    expect(screen.getByTestId("biblia-verse-3")).toBeTruthy();
  });

  it("falha de rede sem cache mostra StatusMessage com opção de tentar de novo", async () => {
    mockGetChapter.mockRejectedValueOnce(new NetworkError());
    mockGetChapter.mockResolvedValueOnce(CHAPTER);

    await act(async () => {
      render(<BibliaChapterScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-chapter-error")).toBeTruthy();
    });
    expect(
      screen.getByText("Não foi possível carregar o capítulo. Verifique sua conexão."),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-chapter-retry"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-verse-1")).toBeTruthy();
    });
    expect(mockGetChapter).toHaveBeenCalledTimes(2);
  });

  it("toque no 1º e no último versículo define o intervalo, com destaque visual nos dois", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);

    await act(async () => {
      render(<BibliaChapterScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-verse-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-1"));
    });
    // Só o 1º toque — 1 selecionado, 3 ainda não.
    expect(screen.getByTestId("biblia-verse-1").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("biblia-verse-3").props.accessibilityState.selected).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-3"));
    });
    // Intervalo fechado 1..3 — os três versículos ficam destacados.
    expect(screen.getByTestId("biblia-verse-1").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("biblia-verse-2").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("biblia-verse-3").props.accessibilityState.selected).toBe(true);
  });

  it('CTA "Comentar" só habilita depois de um intervalo completo (1º e último tocados)', async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);

    await act(async () => {
      render(<BibliaChapterScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-verse-1"));

    expect(screen.getByTestId("biblia-comment-cta").props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-2"));
    });
    // Só o primeiro toque — intervalo ainda incompleto, CTA continua desabilitado.
    expect(screen.getByTestId("biblia-comment-cta").props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-3"));
    });
    expect(screen.getByTestId("biblia-comment-cta").props.accessibilityState.disabled).toBe(false);
  });
});
