import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AxiosError } from "axios";
import { GroupChatPanel } from "./GroupChatPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const axios = await import("axios");
  return {
    default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
    isForbidden: (error: unknown) =>
      axios.default.isAxiosError(error) && error.response?.status === 403,
  };
});

function forbidden() {
  const err = new AxiosError("Forbidden");
  err.response = {
    status: 403,
    data: {},
    statusText: "Forbidden",
    headers: {},
    config: { headers: {} as never },
  };
  return err;
}

const ANA = { id: "p1", full_name: "Ana Souza" };
const BRUNO = { id: "p2", full_name: "Bruno Lima" };

const MESSAGES = [
  {
    id: "m1",
    content: "Alguém leva o violão?",
    created_at: "2026-09-14T10:00:00.000Z",
    person: ANA,
    is_mine: true,
    is_deleted: false,
    can_delete: true,
  },
  {
    id: "m2",
    content: "Eu levo",
    created_at: "2026-09-14T10:05:00.000Z",
    person: BRUNO,
    is_mine: false,
    is_deleted: false,
    can_delete: false,
  },
];

function page(messages: typeof MESSAGES, has_more = false) {
  return { data: { messages, has_more } };
}

describe("GroupChatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lista a conversa do grupo, da mais antiga para a mais nova", async () => {
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));

    render(<GroupChatPanel groupId="g1" />);

    await waitFor(() => expect(screen.getByText("Alguém leva o violão?")).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith("/small-groups/g1/messages");
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Alguém leva o violão?")).toBeInTheDocument();
    expect(within(items[1]).getByText("Eu levo")).toBeInTheDocument();
  });

  it("marca a própria mensagem com '(você)'", async () => {
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));

    render(<GroupChatPanel groupId="g1" />);

    await waitFor(() => expect(screen.getByText("Alguém leva o violão?")).toBeInTheDocument());
    const mine = screen.getByText("Alguém leva o violão?").closest("li");
    expect(within(mine as HTMLElement).getByText(/Ana Souza \(você\)/)).toBeInTheDocument();
  });

  it("403 vira 'sem acesso', não conversa vazia", async () => {
    vi.mocked(api.get).mockRejectedValue(forbidden());

    render(<GroupChatPanel groupId="g1" />);

    await waitFor(() =>
      expect(screen.getByText(/Você não tem acesso a a conversa desta célula/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Nenhuma mensagem na conversa ainda/)).not.toBeInTheDocument();
  });

  it("conversa vazia diz que está vazia", async () => {
    vi.mocked(api.get).mockResolvedValue(page([]));

    render(<GroupChatPanel groupId="g1" />);

    await waitFor(() =>
      expect(screen.getByText("Nenhuma mensagem na conversa ainda.")).toBeInTheDocument(),
    );
  });

  it("envia a mensagem aparada e a acrescenta ao fim sem recarregar tudo", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));
    vi.mocked(api.post).mockResolvedValue({
      data: {
        id: "m3",
        content: "combinado",
        created_at: "2026-09-14T10:10:00.000Z",
        person: ANA,
        is_mine: true,
        is_deleted: false,
        can_delete: true,
      },
    });

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByLabelText("Mensagem")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Mensagem"), "  combinado  ");
    await user.click(screen.getByLabelText("Enviar mensagem"));

    expect(api.post).toHaveBeenCalledWith("/small-groups/g1/messages", { content: "combinado" });
    await waitFor(() => expect(screen.getByText("combinado")).toBeInTheDocument());
    // Uma única carga: a mensagem nova entra pela resposta do POST.
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Mensagem")).toHaveValue("");
  });

  it("Enter envia; Shift+Enter não", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue(page([]));
    vi.mocked(api.post).mockResolvedValue({
      data: {
        id: "m3",
        content: "oi",
        created_at: "2026-09-14T10:10:00.000Z",
        person: ANA,
        is_mine: true,
        is_deleted: false,
        can_delete: true,
      },
    });

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByLabelText("Mensagem")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Mensagem"), "oi{Shift>}{Enter}{/Shift}");
    expect(api.post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Mensagem"), "{Enter}");
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("clique repetido enquanto o POST está no ar não manda a mensagem duas vezes", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue(page([]));
    // POST que nunca resolve: mantém `sending` de pé, que é a guarda.
    vi.mocked(api.post).mockReturnValue(new Promise(() => {}) as never);

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByLabelText("Mensagem")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Mensagem"), "oi");
    await user.click(screen.getByLabelText("Enviar mensagem"));
    await user.click(screen.getByLabelText("Enviar mensagem"));

    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("a lixeira só aparece onde a API disse que pode apagar", async () => {
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));

    render(<GroupChatPanel groupId="g1" />);

    await waitFor(() => expect(screen.getByText("Eu levo")).toBeInTheDocument());
    const mine = screen.getByText("Alguém leva o violão?").closest("li");
    const other = screen.getByText("Eu levo").closest("li");
    expect(within(mine as HTMLElement).getByLabelText("Remover mensagem")).toBeInTheDocument();
    expect(within(other as HTMLElement).queryByLabelText("Remover mensagem")).toBeNull();
  });

  it("apagar deixa lápide na conversa, não buraco", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));
    vi.mocked(api.delete).mockResolvedValue({ data: { id: "m1" } });

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Alguém leva o violão?")).toBeInTheDocument());

    await user.click(screen.getByLabelText("Remover mensagem"));

    expect(api.delete).toHaveBeenCalledWith("/small-groups/g1/messages/m1");
    await waitFor(() => expect(screen.getByText("Mensagem removida")).toBeInTheDocument());
    expect(screen.queryByText("Alguém leva o violão?")).toBeNull();
    // A lápide continua ocupando a linha dela — duas mensagens na lista.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("mensagem já apagada pela API chega como lápide, sem conteúdo nem lixeira", async () => {
    vi.mocked(api.get).mockResolvedValue(
      page([
        {
          ...MESSAGES[0],
          content: "",
          is_deleted: true,
          can_delete: false,
        },
      ]),
    );

    render(<GroupChatPanel groupId="g1" />);

    await waitFor(() => expect(screen.getByText("Mensagem removida")).toBeInTheDocument());
    expect(screen.queryByLabelText("Remover mensagem")).toBeNull();
  });

  it("'carregar anteriores' só aparece com has_more e prepende a página antiga", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce(page(MESSAGES, true));

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Carregar mensagens anteriores")).toBeInTheDocument());

    vi.mocked(api.get).mockResolvedValueOnce(
      page(
        [
          {
            id: "m0",
            content: "mensagem antiga",
            created_at: "2026-09-13T10:00:00.000Z",
            person: BRUNO,
            is_mine: false,
            is_deleted: false,
            can_delete: false,
          },
        ],
        false,
      ),
    );
    await user.click(screen.getByText("Carregar mensagens anteriores"));

    // O cursor é a primeira mensagem da tela, não a última.
    expect(api.get).toHaveBeenLastCalledWith("/small-groups/g1/messages?before=m1");
    await waitFor(() => expect(screen.getByText("mensagem antiga")).toBeInTheDocument());
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("mensagem antiga");
    expect(screen.queryByText("Carregar mensagens anteriores")).toBeNull();
  });

  it("o polling pede só o que chegou depois da última mensagem, e não duplica o que já está na tela", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Eu levo")).toBeInTheDocument());

    vi.mocked(api.get).mockResolvedValue(
      page([
        MESSAGES[1], // repetida de propósito: a mescla é por id
        {
          id: "m3",
          content: "chegou depois",
          created_at: "2026-09-14T10:20:00.000Z",
          person: BRUNO,
          is_mine: false,
          is_deleted: false,
          can_delete: false,
        },
      ]),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(api.get).toHaveBeenLastCalledWith("/small-groups/g1/messages?after=m2");
    await waitFor(() => expect(screen.getByText("chegou depois")).toBeInTheDocument());
    expect(screen.getAllByText("Eu levo")).toHaveLength(1);
  });

  it("não faz polling quando a API respondeu 403 — sem acesso não vira requisição a cada ciclo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockRejectedValue(forbidden());

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() =>
      expect(screen.getByText(/Você não tem acesso a a conversa desta célula/)).toBeInTheDocument(),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("ciclo de polling que volta depois do unmount não vira setState", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));

    const { unmount } = render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Eu levo")).toBeInTheDocument());

    // Ciclo em voo no momento em que a gaveta fecha: o `clearInterval` não
    // alcança essa resposta, quem alcança é o `signal.cancelled`.
    let resolvePoll: (v: ReturnType<typeof page>) => void = () => {};
    vi.mocked(api.get).mockReturnValue(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }) as never,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    unmount();
    await act(async () => {
      resolvePoll(page([{ ...MESSAGES[0], id: "m9", content: "tardia" }]));
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("resposta que chega depois do unmount não vira setState", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let resolveGet: (v: ReturnType<typeof page>) => void = () => {};
    vi.mocked(api.get).mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      }) as never,
    );

    const { unmount } = render(<GroupChatPanel groupId="g1" />);
    unmount();
    await act(async () => {
      resolveGet(page(MESSAGES));
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("erro que chega depois do unmount também é ignorado", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let rejectGet: (e: unknown) => void = () => {};
    vi.mocked(api.get).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectGet = reject;
      }) as never,
    );

    const { unmount } = render(<GroupChatPanel groupId="g1" />);
    unmount();
    await act(async () => {
      rejectGet(forbidden());
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("falha de carga que não é 403 vira mensagem de erro, não 'sem acesso'", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));

    render(<GroupChatPanel groupId="g1" />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar a conversa."),
    );
    expect(screen.queryByText(/Você não tem acesso/)).toBeNull();
  });

  it("falha ao enviar avisa e mantém o texto digitado", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue(page([]));
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByLabelText("Mensagem")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Mensagem"), "oi");
    await user.click(screen.getByLabelText("Enviar mensagem"));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível enviar a mensagem."),
    );
    expect(screen.getByLabelText("Mensagem")).toHaveValue("oi");
  });

  it("falha ao remover avisa e deixa a mensagem como estava", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));
    vi.mocked(api.delete).mockRejectedValue(new Error("boom"));

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Alguém leva o violão?")).toBeInTheDocument());

    await user.click(screen.getByLabelText("Remover mensagem"));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível remover a mensagem."),
    );
    expect(screen.getByText("Alguém leva o violão?")).toBeInTheDocument();
  });

  it("falha ao carregar anteriores avisa e mantém o botão", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValueOnce(page(MESSAGES, true));

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() =>
      expect(screen.getByText("Carregar mensagens anteriores")).toBeInTheDocument(),
    );

    vi.mocked(api.get).mockRejectedValueOnce(new Error("boom"));
    await user.click(screen.getByText("Carregar mensagens anteriores"));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível carregar as mensagens anteriores.",
      ),
    );
    expect(screen.getByText("Carregar mensagens anteriores")).toBeInTheDocument();
  });

  it("ciclo de polling sem novidade não mexe na lista", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Eu levo")).toBeInTheDocument());

    vi.mocked(api.get).mockResolvedValue(page([]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("ciclo lento não é atropelado pelo seguinte", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Eu levo")).toBeInTheDocument());

    // Ciclo que nunca resolve: o guard tem que segurar os seguintes.
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}) as never);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });

    // 1 da carga inicial + 1 único ciclo em voo.
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("com a conversa vazia, o polling pede a lista inteira — não há cursor ainda", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockResolvedValue(page([]));

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() =>
      expect(screen.getByText("Nenhuma mensagem na conversa ainda.")).toBeInTheDocument(),
    );

    vi.mocked(api.get).mockResolvedValue(page([MESSAGES[0]]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(api.get).toHaveBeenLastCalledWith("/small-groups/g1/messages");
    await waitFor(() => expect(screen.getByText("Alguém leva o violão?")).toBeInTheDocument());
  });

  it("falha de um ciclo de polling é silenciosa — sem banner piscando a cada 15s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.get).mockResolvedValue(page(MESSAGES));

    render(<GroupChatPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Eu levo")).toBeInTheDocument());

    vi.mocked(api.get).mockRejectedValue(new Error("boom"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
