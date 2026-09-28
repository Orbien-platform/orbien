// Testes derivados do Done-when de T17 (tasks.md, biblia-nvi-marcacoes-mobile):
// abre a lista de livros, seleciona livro → lista de capítulos, confirma o
// callback `onSelect(bookCode, chapter)` com os valores certos.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { NetworkError } from "../../lib/api/errors";

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
  it("fechado, não busca os livros", async () => {
    await render(<BookChapterPickerModal visible={false} onClose={jest.fn()} onSelect={jest.fn()} />);

    expect(mockGetBooks).not.toHaveBeenCalled();
  });

  it("'Voltar' na lista de capítulos volta para a lista de livros", async () => {
    await render(<BookChapterPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} />);
    await waitFor(() => screen.getByTestId("picker-book-JHN"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("picker-book-JHN"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("picker-back"));
    });

    expect(screen.getByTestId("picker-book-GEN")).toBeTruthy();
  });

  it("sem conexão mostra o erro de conexão; outro erro mostra o genérico", async () => {
    mockGetBooks.mockRejectedValue(new NetworkError());
    const offline = await render(
      <BookChapterPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} />,
    );
    expect(await screen.findByText(/Verifique sua conexão/)).toBeTruthy();
    await act(async () => {
      offline.unmount();
    });

    mockGetBooks.mockRejectedValue(new Error("500"));
    await render(<BookChapterPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} />);
    expect(await screen.findByTestId("picker-error")).toBeTruthy();
    expect(screen.queryByText(/Verifique sua conexão/)).toBeNull();
  });

  it("ignora livros e falhas que chegam depois de o modal desmontar", async () => {
    let resolve!: (value: unknown) => void;
    mockGetBooks.mockReturnValue(new Promise((r) => (resolve = r)));
    const first = await render(
      <BookChapterPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} />,
    );
    await act(async () => {
      first.unmount();
    });
    await act(async () => {
      resolve(BOOKS);
    });

    let reject!: (reason: unknown) => void;
    mockGetBooks.mockReturnValue(new Promise((_, r) => (reject = r)));
    const second = await render(
      <BookChapterPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} />,
    );
    await act(async () => {
      second.unmount();
    });
    await act(async () => {
      reject(new Error("falha de rede"));
    });

    expect(mockGetBooks).toHaveBeenCalledTimes(2);
  });
});
