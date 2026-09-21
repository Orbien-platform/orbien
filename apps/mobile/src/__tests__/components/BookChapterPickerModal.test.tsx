// Testes derivados do Done-when de T17 (tasks.md, biblia-nvi-marcacoes-mobile):
// abre a lista de livros, seleciona livro → lista de capítulos, confirma o
// callback `onSelect(bookCode, chapter)` com os valores certos.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockGetBooks = jest.fn();
jest.mock("../../lib/bible/bible-client", () => ({
  getBooks: (...args: unknown[]) => mockGetBooks(...args),
}));

import { BookChapterPickerModal } from "../../components/BookChapterPickerModal";

const BOOKS = [
  { code: "GEN", name: "Gênesis", testament: "AT", chapters: 50 },
  { code: "JHN", name: "João", testament: "NT", chapters: 21 },
];

describe("BookChapterPickerModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBooks.mockResolvedValue(BOOKS);
  });

  it("abre a lista de livros, seleciona um livro, seleciona um capítulo e dispara onSelect com os valores certos", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
      render(<BookChapterPickerModal visible onClose={onClose} onSelect={onSelect} />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("picker-book-JHN")).toBeTruthy();
    });
    expect(screen.getByTestId("picker-book-GEN")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("picker-book-JHN"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("picker-chapter-3")).toBeTruthy();
    });
    // A lista de livros não fica mais visível — trocou de tela dentro do modal.
    expect(screen.queryByTestId("picker-book-GEN")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("picker-chapter-3"));
    });

    expect(onSelect).toHaveBeenCalledWith("JHN", 3);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("fechar o modal chama onClose", async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
      render(<BookChapterPickerModal visible onClose={onClose} onSelect={onSelect} />);
    });

    await waitFor(() => screen.getByTestId("picker-close"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("picker-close"));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
