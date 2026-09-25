// Tela da marcação com respostas: carrega marcação + respostas, responde
// (com validação e erro da API), apaga só o que `can_delete` permite,
// marcação apagada vira aviso definitivo (sem "tentar de novo"), e a
// referência leva ao capítulo com o trecho destacado.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "m1" }),
  useRouter: () => ({ push: mockPush }),
}));

const mockGetMark = jest.fn();
const mockGetReplies = jest.fn();
const mockCreateReply = jest.fn();
const mockDeleteReply = jest.fn();
const mockLikeMark = jest.fn();
jest.mock("../../../../lib/bible/bible-client", () => ({
  getMark: (...args: unknown[]) => mockGetMark(...args),
  getReplies: (...args: unknown[]) => mockGetReplies(...args),
  createReply: (...args: unknown[]) => mockCreateReply(...args),
  deleteReply: (...args: unknown[]) => mockDeleteReply(...args),
  likeMark: (...args: unknown[]) => mockLikeMark(...args),
  unlikeMark: jest.fn(),
  getBooks: () =>
    Promise.resolve([{ code: "JHN", name: "João", testament: "NT", chapters: 21 }]),
}));

import { HttpError, NetworkError } from "../../../../lib/api/errors";
import BibliaMarkScreen from "../../../../app/biblia/marcacao/[id]";

const MARK = {
  id: "m1",
  book_code: "JHN",
  chapter: 3,
  verse_start: 16,
  verse_end: 16,
  comment: "Deus amou o mundo.",
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
  person: { id: "p-autor", full_name: "Carla" },
  is_mine: false,
  can_delete: false,
  like_count: 1,
  liked_by_me: false,
  reply_count: 1,
};

function reply(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    mark_id: "m1",
    comment: "Amém!",
    created_at: "2026-09-21T10:00:00Z",
    person: { id: "p2", full_name: "Davi" },
    is_mine: false,
    can_delete: false,
    ...overrides,
  };
}

async function renderLoaded() {
  await act(async () => {
    render(<BibliaMarkScreen />);
  });
  await waitFor(() => screen.getByTestId("biblia-mark-screen"));
}

describe("BibliaMarkScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMark.mockResolvedValue(MARK);
    mockGetReplies.mockResolvedValue([reply()]);
  });

  it("mostra a marcação com a referência por nome e as respostas", async () => {
    await renderLoaded();

    expect(mockGetMark).toHaveBeenCalledWith("m1");
    expect(mockGetReplies).toHaveBeenCalledWith("m1");
    expect(await screen.findByText("João 3:16")).toBeTruthy();
    expect(screen.getByText("Deus amou o mundo.")).toBeTruthy();
    expect(screen.getByTestId("biblia-reply-r1")).toHaveTextContent(/Amém!/);
  });

  it("sem respostas, convida a escrever a primeira", async () => {
    mockGetReplies.mockResolvedValue([]);
    await renderLoaded();

    expect(screen.getByTestId("biblia-mark-no-replies")).toBeTruthy();
  });

  it("responder envia o texto aparado e acrescenta a resposta no fim da lista", async () => {
    mockCreateReply.mockResolvedValue(reply({ id: "r2", comment: "Que palavra.", is_mine: true, can_delete: true }));
    await renderLoaded();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-reply-input"), "  Que palavra.  ");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-reply-send"));
    });

    expect(mockCreateReply).toHaveBeenCalledWith("m1", "Que palavra.");
    await waitFor(() => expect(screen.getByTestId("biblia-reply-r2")).toBeTruthy());
    expect(screen.getByTestId("biblia-reply-input").props.value).toBe("");
  });

  it("resposta curta demais não chama a API", async () => {
    await renderLoaded();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-reply-input"), "ok");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-reply-send"));
    });

    expect(mockCreateReply).not.toHaveBeenCalled();
    expect(screen.getByTestId("biblia-reply-error")).toHaveTextContent(
      "A resposta precisa ter entre 3 e 1000 caracteres.",
    );
  });

  it("falha ao enviar mantém o rascunho e mostra o erro", async () => {
    mockCreateReply.mockRejectedValue(new HttpError(502, { message: "Bad Gateway" }));
    await renderLoaded();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-reply-input"), "Resposta válida.");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-reply-send"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("biblia-reply-error")).toHaveTextContent(
        "Não foi possível enviar a resposta. Tente novamente.",
      ),
    );
    expect(screen.getByTestId("biblia-reply-input").props.value).toBe("Resposta válida.");
  });

  it("apagar só aparece com can_delete, e tira a resposta da lista", async () => {
    mockGetReplies.mockResolvedValue([
      reply(),
      reply({ id: "r2", comment: "Minha", is_mine: true, can_delete: true }),
    ]);
    mockDeleteReply.mockResolvedValue({ id: "r2" });
    await renderLoaded();

    expect(screen.queryByTestId("biblia-reply-delete-r1")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-reply-delete-r2"));
    });

    expect(mockDeleteReply).toHaveBeenCalledWith("m1", "r2");
    await waitFor(() => expect(screen.queryByTestId("biblia-reply-r2")).toBeNull());
  });

  it("marcação apagada (404) vira aviso definitivo, sem tentar de novo", async () => {
    mockGetMark.mockRejectedValue(new HttpError(404, { message: "Marcação não encontrada" }));

    await act(async () => {
      render(<BibliaMarkScreen />);
    });

    await waitFor(() => expect(screen.getByTestId("biblia-mark-gone")).toBeTruthy());
    expect(screen.queryByTestId("biblia-mark-retry")).toBeNull();
  });

  it("tocar na referência abre o capítulo com o trecho destacado", async () => {
    await renderLoaded();

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-mark-open-chapter"));
    });

    expect(mockPush).toHaveBeenCalledWith("/biblia/JHN/3?verse_start=16&verse_end=16");
  });

  it("falha de rede mostra erro com tentar de novo, e o retry recarrega", async () => {
    mockGetMark.mockRejectedValueOnce(new NetworkError());

    await act(async () => {
      render(<BibliaMarkScreen />);
    });
    await waitFor(() => expect(screen.getByTestId("biblia-mark-error")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-mark-retry"));
    });

    await waitFor(() => expect(screen.getByTestId("biblia-mark-screen")).toBeTruthy());
    expect(mockGetMark).toHaveBeenCalledTimes(2);
  });

  it("apagar que falha mantém a resposta e mostra o erro", async () => {
    mockGetReplies.mockResolvedValue([reply({ id: "r2", is_mine: true, can_delete: true })]);
    mockDeleteReply.mockRejectedValue(new HttpError(500, { message: "x" }));
    await renderLoaded();

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-reply-delete-r2"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("biblia-reply-delete-error")).toHaveTextContent(
        "Não foi possível apagar a resposta. Tente novamente.",
      ),
    );
    expect(screen.getByTestId("biblia-reply-r2")).toBeTruthy();
  });

  it("curtir aqui atualiza a contagem da marcação", async () => {
    mockLikeMark.mockResolvedValue({ liked: true, like_count: 7 });
    await renderLoaded();

    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-mark-like-m1"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("biblia-mark-like-count-m1")).toHaveTextContent("7"),
    );
  });

  it("autor sem nome aparece como Alguém", async () => {
    mockGetMark.mockResolvedValue({ ...MARK, person: null });
    mockGetReplies.mockResolvedValue([reply({ person: null })]);
    await renderLoaded();

    expect(screen.getAllByText(/Alguém/).length).toBeGreaterThanOrEqual(2);
  });

  it("ignora a resposta que chega depois de a tela desmontar", async () => {
    let resolve!: (value: unknown) => void;
    mockGetMark.mockReturnValue(new Promise((r) => (resolve = r)));

    const view = await render(<BibliaMarkScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolve(MARK);
    });

    expect(mockGetMark).toHaveBeenCalled();
  });

  it("ignora a falha que chega depois de a tela desmontar", async () => {
    let reject!: (reason: unknown) => void;
    mockGetMark.mockReturnValue(new Promise((_, r) => (reject = r)));

    const view = await render(<BibliaMarkScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      reject(new Error("falha de rede"));
    });

    expect(mockGetMark).toHaveBeenCalled();
  });

  it("erro que não é de conexão nem 404 mostra a mensagem genérica", async () => {
    mockGetMark.mockRejectedValue(new HttpError(500, { message: "x" }));

    await render(<BibliaMarkScreen />);

    expect(await screen.findByTestId("biblia-mark-error")).toBeTruthy();
    expect(screen.queryByText(/Verifique sua conexão/)).toBeNull();
  });

  it("recusa da API ao responder (4xx) mostra a mensagem que ela mandou", async () => {
    mockCreateReply.mockRejectedValue(new HttpError(403, { message: "Respostas desativadas." }));

    await renderLoaded();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("biblia-reply-input"), "Resposta válida.");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-reply-send"));
    });

    expect(screen.getByTestId("biblia-reply-error").props.children).toBe("Respostas desativadas.");
  });

  it("resposta com data ilegível mostra só o nome", async () => {
    mockGetReplies.mockResolvedValue([reply({ created_at: "sem data" })]);

    await renderLoaded();

    expect(screen.getByText("Davi")).toBeTruthy();
  });

  it("apagar outra resposta enquanto um apagamento está em andamento não dispara segunda chamada", async () => {
    mockGetReplies.mockResolvedValue([
      reply({ id: "r1", can_delete: true }),
      reply({ id: "r2", can_delete: true, comment: "Outra." }),
    ]);
    let resolveDelete!: () => void;
    mockDeleteReply.mockReturnValue(new Promise<void>((r) => (resolveDelete = r)));

    await renderLoaded();
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-reply-delete-r1"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("biblia-reply-delete-r2"));
    });
    await act(async () => {
      resolveDelete();
    });

    expect(mockDeleteReply).toHaveBeenCalledTimes(1);
    expect(mockDeleteReply).toHaveBeenCalledWith("m1", "r1");
    expect(screen.getByTestId("biblia-reply-r2")).toBeTruthy();
  });
  it("no Android, a tela não empurra o teclado com padding (só o iOS precisa)", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      await renderLoaded();
      expect(screen.getByTestId("biblia-reply-input")).toBeTruthy();
    } finally {
      os.restore();
    }
  });
});
