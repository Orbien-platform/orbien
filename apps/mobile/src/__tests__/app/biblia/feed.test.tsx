// Testes derivados do Done-when de T22 (tasks.md, biblia-nvi-marcacoes-mobile,
// BIB-06/BIB-07/BIB-08/BIB-09/BIB-10): lista mais recente primeiro,
// paginação por cursor `before`, estado vazio e de erro distintos, toque no
// item navega para a leitura com o intervalo em destaque, editar/apagar só
// aparecem quando `is_mine`/`can_delete` permitem, exclusão própria e como
// moderador.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
}));

const mockGetFeed = jest.fn();
const mockUpdateMark = jest.fn();
const mockDeleteMark = jest.fn();
jest.mock("../../../lib/bible/bible-client", () => ({
  getFeed: (...args: unknown[]) => mockGetFeed(...args),
  updateMark: (...args: unknown[]) => mockUpdateMark(...args),
  deleteMark: (...args: unknown[]) => mockDeleteMark(...args),
  getBooks: () =>
    Promise.resolve([{ code: "JHN", name: "João", testament: "NT", chapters: 21 }]),
}));

import { HttpError } from "../../../lib/api/errors";
import BibliaFeedScreen from "../../../app/biblia/feed";
import type { BibleVerseMark } from "../../../lib/bible/types";

function mark(overrides: Partial<BibleVerseMark> = {}): BibleVerseMark {
  return {
    id: "mark-1",
    book_code: "JHN",
    chapter: 3,
    verse_start: 16,
    verse_end: 18,
    comment: "Deus amou o mundo.",
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    person: { id: "p1", full_name: "Fulano" },
    is_mine: false,
    can_delete: false,
    ...overrides,
  };
}

describe("BibliaFeedScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("carrega e lista as marcações da congregação (BIB-06)", async () => {
    const item = mark();
    mockGetFeed.mockResolvedValue({ items: [item], nextCursor: null });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-feed-item-mark-1")).toBeTruthy();
    });
    expect(mockGetFeed).toHaveBeenCalledWith();
    expect(screen.getByText("Deus amou o mundo.")).toBeTruthy();
    expect(await screen.findByText("João 3:16-18")).toBeTruthy();
  });

  it("feed vazio mostra estado vazio explícito, não erro (BIB-06 AC5)", async () => {
    mockGetFeed.mockResolvedValue({ items: [], nextCursor: null });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-feed-empty")).toBeTruthy();
    });
    expect(screen.queryByTestId("biblia-feed-error")).toBeNull();

    // O vazio aponta o caminho: é lendo um capítulo que se comenta.
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-empty-open-bible"));
    });
    expect(mockNavigate).toHaveBeenCalledWith("/biblia");
  });

  it("erro de rede no load inicial mostra estado de erro visível, não lista vazia", async () => {
    mockGetFeed.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<BibliaFeedScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-feed-error")).toBeTruthy();
    });
    expect(screen.queryByTestId("biblia-feed-list")).toBeNull();
    expect(screen.queryByTestId("biblia-feed-empty")).toBeNull();
  });

  it('"Carregar mais" busca a próxima página pelo cursor (before) e concatena (BIB-08)', async () => {
    const item1 = mark({ id: "mark-1" });
    const item2 = mark({ id: "mark-2", comment: "Segundo comentário." });
    mockGetFeed.mockResolvedValueOnce({ items: [item1], nextCursor: "cursor-1" });
    mockGetFeed.mockResolvedValueOnce({ items: [item2], nextCursor: null });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-load-more"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-load-more"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-feed-item-mark-2")).toBeTruthy();
    });
    // o primeiro item continua na lista — concatenou, não substituiu.
    expect(screen.getByTestId("biblia-feed-item-mark-1")).toBeTruthy();
    expect(mockGetFeed).toHaveBeenNthCalledWith(2, { before: "cursor-1" });
    // nextCursor voltou null — não há mais páginas, botão some.
    expect(screen.queryByTestId("biblia-feed-load-more")).toBeNull();
  });

  it('"Carregar mais" falha: itens já carregados continuam visíveis, erro pontual aparece', async () => {
    mockGetFeed.mockResolvedValueOnce({ items: [mark({ id: "mark-1" })], nextCursor: "cursor-1" });
    mockGetFeed.mockRejectedValueOnce(new Error("falha de rede"));

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-load-more"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-load-more"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-feed-load-more-error")).toBeTruthy();
    });
    expect(screen.getByTestId("biblia-feed-item-mark-1")).toBeTruthy();
  });

  it("toque no item navega para /biblia/[book]/[chapter] com o intervalo em destaque (BIB-06 AC4)", async () => {
    mockGetFeed.mockResolvedValue({ items: [mark({ id: "mark-1" })], nextCursor: null });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-item-open-mark-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-item-open-mark-1"));
    });

    expect(mockPush).toHaveBeenCalledWith("/biblia/JHN/3?verse_start=16&verse_end=18");
  });

  it("editar/apagar só aparecem quando is_mine/can_delete permitem (BIB-09/BIB-10)", async () => {
    const notMine = mark({ id: "mark-1", is_mine: false, can_delete: false });
    const ownedByModerator = mark({ id: "mark-2", is_mine: false, can_delete: true });
    const ownedByAuthor = mark({ id: "mark-3", is_mine: true, can_delete: true });
    mockGetFeed.mockResolvedValue({ items: [notMine, ownedByModerator, ownedByAuthor], nextCursor: null });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-item-mark-1"));

    expect(screen.queryByTestId("biblia-feed-edit-mark-1")).toBeNull();
    expect(screen.queryByTestId("biblia-feed-delete-mark-1")).toBeNull();

    expect(screen.queryByTestId("biblia-feed-edit-mark-2")).toBeNull();
    expect(screen.getByTestId("biblia-feed-delete-mark-2")).toBeTruthy();

    expect(screen.getByTestId("biblia-feed-edit-mark-3")).toBeTruthy();
    expect(screen.getByTestId("biblia-feed-delete-mark-3")).toBeTruthy();
  });

  it("autor apaga a própria marcação: chama deleteMark e o item some do feed (BIB-09)", async () => {
    const own = mark({ id: "mark-1", is_mine: true, can_delete: true });
    mockGetFeed.mockResolvedValue({ items: [own], nextCursor: null });
    mockDeleteMark.mockResolvedValue({ id: "mark-1" });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-delete-mark-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-delete-mark-1"));
    });

    await waitFor(() => {
      expect(mockDeleteMark).toHaveBeenCalledWith("mark-1");
    });
    expect(screen.queryByTestId("biblia-feed-item-mark-1")).toBeNull();
  });

  it("moderador apaga a marcação de outra pessoa: chama deleteMark e o item some do feed (BIB-10)", async () => {
    const other = mark({ id: "mark-1", is_mine: false, can_delete: true });
    mockGetFeed.mockResolvedValue({ items: [other], nextCursor: null });
    mockDeleteMark.mockResolvedValue({ id: "mark-1" });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-delete-mark-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-delete-mark-1"));
    });

    await waitFor(() => {
      expect(mockDeleteMark).toHaveBeenCalledWith("mark-1");
    });
    expect(screen.queryByTestId("biblia-feed-item-mark-1")).toBeNull();
    // editar nunca aparece para quem não é autor, mesmo sendo moderador.
    expect(screen.queryByTestId("biblia-feed-edit-mark-1")).toBeNull();
  });

  it("apagar sem permissão (403 do backend) mostra Alert, item continua no feed", async () => {
    const own = mark({ id: "mark-1", is_mine: true, can_delete: true });
    mockGetFeed.mockResolvedValue({ items: [own], nextCursor: null });
    mockDeleteMark.mockRejectedValue(new HttpError(403, { message: "Sem permissão para apagar." }));

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-delete-mark-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-delete-mark-1"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-feed-delete-error")).toHaveTextContent(
        "Sem permissão para apagar.",
      );
    });
    expect(screen.getByTestId("biblia-feed-item-mark-1")).toBeTruthy();
  });

  it("autor edita o próprio comentário: chama updateMark e o texto atualizado aparece (BIB-09)", async () => {
    const own = mark({ id: "mark-1", is_mine: true, can_delete: true, comment: "Original." });
    mockGetFeed.mockResolvedValue({ items: [own], nextCursor: null });
    mockUpdateMark.mockResolvedValue({ ...own, comment: "Editado." });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-edit-mark-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-edit-mark-1"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-feed-edit-input-mark-1"), "Editado.");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-edit-save-mark-1"));
    });

    await waitFor(() => {
      expect(mockUpdateMark).toHaveBeenCalledWith("mark-1", "Editado.");
    });
    expect(screen.getByText("Editado.")).toBeTruthy();
    expect(screen.queryByTestId("biblia-feed-edit-form-mark-1")).toBeNull();
  });

  it("editar com comentário curto demais bloqueia o submit, sem chamar a API (BIB-05)", async () => {
    const own = mark({ id: "mark-1", is_mine: true, can_delete: true });
    mockGetFeed.mockResolvedValue({ items: [own], nextCursor: null });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-edit-mark-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-edit-mark-1"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-feed-edit-input-mark-1"), "ab");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-edit-save-mark-1"));
    });

    expect(mockUpdateMark).not.toHaveBeenCalled();
    expect(screen.getByTestId("biblia-feed-edit-validation-error-mark-1")).toBeTruthy();
  });

  it('"Cancelar" fecha o formulário de edição sem chamar updateMark, texto original preservado', async () => {
    const own = mark({ id: "mark-1", is_mine: true, can_delete: true, comment: "Original." });
    mockGetFeed.mockResolvedValue({ items: [own], nextCursor: null });

    await act(async () => {
      render(<BibliaFeedScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-feed-edit-mark-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-edit-mark-1"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-feed-edit-input-mark-1"), "rascunho descartado");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-feed-edit-cancel-mark-1"));
    });

    expect(mockUpdateMark).not.toHaveBeenCalled();
    expect(screen.queryByTestId("biblia-feed-edit-form-mark-1")).toBeNull();
    expect(screen.getByText("Original.")).toBeTruthy();
  });
});
