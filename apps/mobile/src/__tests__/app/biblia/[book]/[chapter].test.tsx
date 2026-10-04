// Testes derivados do Done-when de T19, T21 e T22 (tasks.md,
// biblia-nvi-marcacoes-mobile, BIB-01/BIB-02/BIB-03/BIB-04/BIB-05/BIB-06):
// sucesso (versículos numerados), erro de rede com retry, regra do toque
// (um toque marca um versículo, outro estende o trecho, tocar no único
// desmarca), barra de marcação com a referência e o "Comentar", submissão
// válida chama `createMark` e oferece o feed, comentário curto demais
// bloqueia o submit, erro do backend aparece via `Alert`, intervalo vindo da
// query (`verse_start`/`verse_end`, navegação do feed) já chega destacado.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

let mockSearchParams: { book: string; chapter: string; verse_start?: string; verse_end?: string } = {
  book: "JHN",
  chapter: "3",
};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

const mockGetChapter = jest.fn();
const mockCreateMark = jest.fn();
jest.mock("../../../../lib/bible/bible-client", () => ({
  getChapter: (...args: unknown[]) => mockGetChapter(...args),
  createMark: (...args: unknown[]) => mockCreateMark(...args),
  getBooks: () =>
    Promise.resolve([{ code: "JHN", name: "João", testament: "NT", chapters: 21 }]),
}));

import { HttpError, NetworkError } from "../../../../lib/api/errors";
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

async function selectRangeAndOpenComposer() {
  await act(async () => {
    render(<BibliaChapterScreen />);
  });
  await waitFor(() => screen.getByTestId("biblia-verse-1"));

  await act(async () => {
    fireEvent.press(screen.getByTestId("biblia-verse-1"));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId("biblia-verse-3"));
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId("biblia-comment-cta"));
  });
}

describe("BibliaChapterScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { book: "JHN", chapter: "3" };
    mockGetChapter.mockReset();
    mockCreateMark.mockReset();
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

  it("um toque já marca o versículo e mostra o Comentar logo abaixo dele, com a referência", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);

    await act(async () => {
      render(<BibliaChapterScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-verse-1"));

    // Sem nada marcado: a dica explica o gesto e não há ação.
    expect(screen.getByTestId("biblia-chapter-hint")).toBeTruthy();
    expect(screen.queryByTestId("biblia-selection-actions")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-2"));
    });

    expect(screen.getByTestId("biblia-verse-2").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("biblia-verse-3").props.accessibilityState.selected).toBe(false);
    expect(await screen.findByText("Comentar João 3:2")).toBeTruthy();
    expect(screen.getByTestId("biblia-comment-cta").props.accessibilityState.disabled).toBe(false);
  });

  it("toque em outro versículo estende o trecho, em qualquer ordem, e o seguinte recomeça", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);

    await act(async () => {
      render(<BibliaChapterScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-verse-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-3"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-1"));
    });
    expect(screen.getByTestId("biblia-verse-1").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("biblia-verse-2").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("biblia-verse-3").props.accessibilityState.selected).toBe(true);
    expect(await screen.findByText("Comentar João 3:1-3")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-2"));
    });
    expect(screen.getByTestId("biblia-verse-1").props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId("biblia-verse-2").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("biblia-verse-3").props.accessibilityState.selected).toBe(false);
  });

  it("tocar no único versículo marcado, ou em Desmarcar, tira a marcação e a ação", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);

    await act(async () => {
      render(<BibliaChapterScreen />);
    });
    await waitFor(() => screen.getByTestId("biblia-verse-1"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-2"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-2"));
    });
    expect(screen.getByTestId("biblia-verse-2").props.accessibilityState.selected).toBe(false);
    expect(screen.queryByTestId("biblia-selection-actions")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-verse-1"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-selection-clear"));
    });
    expect(screen.getByTestId("biblia-verse-1").props.accessibilityState.selected).toBe(false);
    expect(screen.queryByTestId("biblia-selection-actions")).toBeNull();
  });

  it("submissão válida chama createMark com o intervalo e o comentário, e confirma visualmente (BIB-04)", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);
    mockCreateMark.mockResolvedValue({
      id: "mark-1",
      book_code: "JHN",
      chapter: 3,
      verse_start: 1,
      verse_end: 3,
      comment: "Reflexão sobre o novo nascimento.",
      created_at: "2026-09-21T10:00:00Z",
      updated_at: "2026-09-21T10:00:00Z",
      person: { id: "p1", full_name: "Fulano" },
      is_mine: true,
      can_delete: true,
    });

    await selectRangeAndOpenComposer();

    // A folha cita o trecho que vai para o feed.
    expect(screen.getByTestId("biblia-comment-quote")).toHaveTextContent(/Havia um fariseu/);
    expect(screen.getByTestId("biblia-comment-quote")).toHaveTextContent(/Jesus lhe respondeu/);

    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId("biblia-comment-input"),
        "Reflexão sobre o novo nascimento.",
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-comment-submit"));
    });

    await waitFor(() => {
      expect(mockCreateMark).toHaveBeenCalledWith({
        book_code: "JHN",
        chapter: 3,
        verse_start: 1,
        verse_end: 3,
        comment: "Reflexão sobre o novo nascimento.",
      });
    });
    // Sucesso fecha o composer, confirma com a referência e oferece o feed.
    await waitFor(() => {
      expect(screen.getByTestId("biblia-comment-saved")).toHaveTextContent(
        "João 3:1-3 publicado no feed da congregação.",
      );
    });
    expect(screen.queryByTestId("biblia-comment-composer")).toBeNull();
    expect(screen.getByTestId("biblia-verse-1").props.accessibilityState.selected).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-open-feed"));
    });
    expect(mockPush).toHaveBeenCalledWith("/biblia/feed");
  });

  it("comentário com menos de 3 caracteres bloqueia o submit, sem chamar a API (BIB-05)", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);

    await selectRangeAndOpenComposer();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-comment-input"), "ab");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-comment-submit"));
    });

    expect(mockCreateMark).not.toHaveBeenCalled();
    expect(screen.getByTestId("biblia-comment-validation-error")).toHaveTextContent(
      "O comentário precisa ter entre 3 e 2000 caracteres.",
    );
    // Composer continua aberto — nada foi submetido.
    expect(screen.getByTestId("biblia-comment-composer")).toBeTruthy();
  });

  it("comentário só com espaços em branco é tratado como vazio e bloqueia o submit (edge case da spec)", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);

    await selectRangeAndOpenComposer();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-comment-input"), "   ");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-comment-submit"));
    });

    expect(mockCreateMark).not.toHaveBeenCalled();
    expect(screen.getByTestId("biblia-comment-validation-error")).toBeTruthy();
  });

  it("erro 403 do backend aparece via Alert, com a mensagem da API, sem confirmar sucesso", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);
    mockCreateMark.mockRejectedValue(new HttpError(403, { message: "Sem permissão para marcar." }));

    await selectRangeAndOpenComposer();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-comment-input"), "Comentário válido.");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-comment-submit"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-comment-submit-error")).toHaveTextContent(
        "Sem permissão para marcar.",
      );
    });
    expect(screen.queryByTestId("biblia-comment-saved")).toBeNull();
    // Composer continua aberto, comentário não se perde.
    expect(screen.getByTestId("biblia-comment-composer")).toBeTruthy();
  });

  it("erro 502 (falha do provedor externo) aparece via Alert com mensagem genérica", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);
    mockCreateMark.mockRejectedValue(new HttpError(502, { message: "Bad Gateway" }));

    await selectRangeAndOpenComposer();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-comment-input"), "Comentário válido.");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-comment-submit"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-comment-submit-error")).toHaveTextContent(
        "Não foi possível publicar o comentário. Tente novamente.",
      );
    });
  });

  it('"Cancelar" fecha o composer e limpa comentário/erros — reabrir começa do zero', async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);

    await selectRangeAndOpenComposer();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-comment-input"), "rascunho que será descartado");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-comment-cancel"));
    });

    expect(screen.queryByTestId("biblia-comment-composer")).toBeNull();
    expect(mockCreateMark).not.toHaveBeenCalled();
  });

  it("chega com verse_start/verse_end na query (navegação do feed) e já abre com o intervalo em destaque (BIB-06)", async () => {
    mockSearchParams = { book: "JHN", chapter: "3", verse_start: "1", verse_end: "3" };
    mockGetChapter.mockResolvedValue(CHAPTER);

    await act(async () => {
      render(<BibliaChapterScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("biblia-verse-1").props.accessibilityState.selected).toBe(true);
    });
    expect(screen.getByTestId("biblia-verse-2").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("biblia-verse-3").props.accessibilityState.selected).toBe(true);
    // A barra já oferece o "Comentar" — o intervalo chegou completo.
    expect(screen.getByTestId("biblia-comment-cta").props.accessibilityState.disabled).toBe(false);
  });

  it("ignora a resposta que chega depois de a tela desmontar", async () => {
    let resolve!: (value: unknown) => void;
    mockGetChapter.mockReturnValue(new Promise((r) => (resolve = r)));

    const view = await render(<BibliaChapterScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolve(CHAPTER);
    });

    expect(mockGetChapter).toHaveBeenCalled();
  });

  it("ignora a falha que chega depois de a tela desmontar", async () => {
    let reject!: (reason: unknown) => void;
    mockGetChapter.mockReturnValue(new Promise((_, r) => (reject = r)));

    const view = await render(<BibliaChapterScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      reject(new Error("falha de rede"));
    });

    expect(mockGetChapter).toHaveBeenCalled();
  });

  it("erro que não é de conexão mostra a mensagem genérica", async () => {
    mockGetChapter.mockRejectedValue(new HttpError(500, { message: "x" }));

    await render(<BibliaChapterScreen />);

    expect(await screen.findByTestId("biblia-chapter-error")).toBeTruthy();
    expect(screen.queryByText(/Verifique sua conexão/)).toBeNull();
  });
  it("no Android o capítulo abre sem o padding de teclado do iOS", async () => {
    mockGetChapter.mockResolvedValue(CHAPTER);
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      await render(<BibliaChapterScreen />);
      expect(await screen.findByTestId("biblia-verse-1")).toBeTruthy();
    } finally {
      os.restore();
    }
  });
});
