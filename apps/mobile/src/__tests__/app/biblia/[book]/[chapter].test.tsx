// Testes derivados do Done-when de T19 e T21 (tasks.md,
// biblia-nvi-marcacoes-mobile, BIB-01/BIB-02/BIB-03/BIB-04/BIB-05): sucesso
// (versículos numerados), erro de rede com retry, seleção de intervalo
// tocando no 1º e no último versículo, CTA "Comentar" habilita só com
// intervalo completo, submissão válida chama `createMark`, comentário curto
// demais bloqueia o submit, erro do backend aparece via `Alert`.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

let mockSearchParams: { book: string; chapter: string } = { book: "JHN", chapter: "3" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
}));

const mockGetChapter = jest.fn();
const mockCreateMark = jest.fn();
jest.mock("../../../../lib/bible/bible-client", () => ({
  getChapter: (...args: unknown[]) => mockGetChapter(...args),
  createMark: (...args: unknown[]) => mockCreateMark(...args),
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
    // Sucesso fecha o composer e confirma visualmente (Done-when de T21).
    await waitFor(() => {
      expect(screen.getByTestId("biblia-comment-saved")).toBeTruthy();
    });
    expect(screen.queryByTestId("biblia-comment-composer")).toBeNull();
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
        "Não foi possível salvar a marcação. Tente novamente.",
      );
    });
  });
});
