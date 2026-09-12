import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";
import { PrayerRequestsPanel } from "./PrayerRequestsPanel";
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

const REQUESTS = [
  {
    id: "pr1",
    content: "Orem pela minha mãe",
    is_anonymous: false,
    created_at: "2026-09-12T10:00:00.000Z",
    person: { id: "p1", full_name: "Ana Souza" },
    is_mine: true,
    can_delete: true,
  },
  {
    id: "pr2",
    content: "Assunto delicado",
    is_anonymous: true,
    created_at: "2026-09-11T10:00:00.000Z",
    person: null,
    is_mine: false,
    can_delete: false,
  },
  {
    id: "pr3",
    content: "Meu pedido anônimo",
    is_anonymous: true,
    created_at: "2026-09-10T10:00:00.000Z",
    person: { id: "p1", full_name: "Ana Souza" },
    is_mine: true,
    can_delete: true,
  },
];

describe("PrayerRequestsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista os pedidos do grupo, com o autor quando há e 'Anônimo' quando não", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: REQUESTS });

    render(<PrayerRequestsPanel groupId="g1" />);

    await waitFor(() => expect(screen.getByText("Orem pela minha mãe")).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith("/small-groups/g1/prayer-requests");
    const signedItem = screen.getByText("Orem pela minha mãe").closest("li");
    expect(within(signedItem as HTMLElement).getByText(/Ana Souza/)).toBeInTheDocument();
    // Escopado na linha do pedido: "Anônimo" também aparece no rótulo do
    // checkbox do formulário, e um match solto passaria sem provar nada.
    const anonItem = screen.getByText("Assunto delicado").closest("li");
    expect(within(anonItem as HTMLElement).getByText(/^Anônimo/)).toBeInTheDocument();
  });

  it("no pedido anônimo do próprio autor, a tela diz que é anônimo para os outros", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: REQUESTS });

    render(<PrayerRequestsPanel groupId="g1" />);

    await waitFor(() => expect(screen.getByText("Meu pedido anônimo")).toBeInTheDocument());
    const mineItem = screen.getByText("Meu pedido anônimo").closest("li");
    expect(within(mineItem as HTMLElement).getByText(/Ana Souza/)).toHaveTextContent(
      "(anônimo para os outros)",
    );
  });

  it("resposta que chega depois do unmount não vira setState", async () => {
    // O `signal.cancelled` do effect: sem ele, a resposta tardia chamaria
    // setState em componente desmontado. Prova pelo console limpo — o React
    // avisa, e o teste falharia por ele.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let resolveGet: (v: { data: typeof REQUESTS }) => void = () => {};
    vi.mocked(api.get).mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      }) as never,
    );

    const { unmount } = render(<PrayerRequestsPanel groupId="g1" />);
    unmount();
    await act(async () => {
      resolveGet({ data: REQUESTS });
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

    const { unmount } = render(<PrayerRequestsPanel groupId="g1" />);
    unmount();
    await act(async () => {
      rejectGet(forbidden());
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("clique repetido enquanto o POST está no ar não manda o pedido duas vezes", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    // POST que nunca resolve: mantém `submitting` de pé, que é a guarda.
    vi.mocked(api.post).mockReturnValue(new Promise(() => {}) as never);

    render(<PrayerRequestsPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByLabelText("Novo pedido")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Novo pedido"), "Orem por mim");
    const button = screen.getByRole("button", { name: "Registrar pedido" });
    await user.click(button);
    await user.click(button);

    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("403 mostra 'sem acesso', não lista vazia — quem não participa não lê a célula", async () => {
    vi.mocked(api.get).mockRejectedValue(forbidden());

    render(<PrayerRequestsPanel groupId="g1" />);

    await waitFor(() =>
      expect(
        screen.getByText(/Você não tem acesso a os pedidos de oração desta célula/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Nenhum pedido de oração registrado.")).not.toBeInTheDocument();
  });

  it("lista vazia diz que não há pedido, e o formulário continua de pé", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    render(<PrayerRequestsPanel groupId="g1" />);

    await waitFor(() =>
      expect(screen.getByText("Nenhum pedido de oração registrado.")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Novo pedido")).toBeInTheDocument();
  });

  it("só desenha a lixeira onde can_delete é verdadeiro", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: REQUESTS });

    render(<PrayerRequestsPanel groupId="g1" />);

    await waitFor(() => expect(screen.getByText("Orem pela minha mãe")).toBeInTheDocument());
    // 3 pedidos na lista, 2 com can_delete.
    expect(screen.getAllByLabelText("Remover pedido")).toHaveLength(2);
  });

  it("registra o pedido com o texto e a marca de anônimo, e recarrega a lista", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValue({ data: { id: "pr9" } });

    render(<PrayerRequestsPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByLabelText("Novo pedido")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Novo pedido"), "Orem pelo meu pai");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Registrar pedido" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/small-groups/g1/prayer-requests", {
        content: "Orem pelo meu pai",
        is_anonymous: true,
      }),
    );
    // Recarrega: a busca inicial + a de depois do POST.
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("não deixa enviar pedido curto demais", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });

    render(<PrayerRequestsPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByLabelText("Novo pedido")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Novo pedido"), "ok");

    expect(screen.getByRole("button", { name: "Registrar pedido" })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("remove o pedido e tira a linha da tela", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: REQUESTS });
    vi.mocked(api.delete).mockResolvedValue({ data: { id: "pr1" } });

    render(<PrayerRequestsPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Orem pela minha mãe")).toBeInTheDocument());

    await user.click(screen.getAllByLabelText("Remover pedido")[0]);

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/small-groups/g1/prayer-requests/pr1"),
    );
    await waitFor(() =>
      expect(screen.queryByText("Orem pela minha mãe")).not.toBeInTheDocument(),
    );
  });

  it("erro que não é 403 vira mensagem, não 'sem acesso'", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));

    render(<PrayerRequestsPanel groupId="g1" />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível carregar os pedidos de oração.",
      ),
    );
    expect(screen.queryByText(/Você não tem acesso/)).not.toBeInTheDocument();
  });

  it("falha ao remover mostra erro e mantém a linha", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: REQUESTS });
    vi.mocked(api.delete).mockRejectedValue(new Error("boom"));

    render(<PrayerRequestsPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByText("Orem pela minha mãe")).toBeInTheDocument());

    await user.click(screen.getAllByLabelText("Remover pedido")[0]);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível remover o pedido."),
    );
    expect(screen.getByText("Orem pela minha mãe")).toBeInTheDocument();
  });

  it("falha ao registrar mostra erro e preserva o texto digitado", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));

    render(<PrayerRequestsPanel groupId="g1" />);
    await waitFor(() => expect(screen.getByLabelText("Novo pedido")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Novo pedido"), "Orem por mim");
    await user.click(screen.getByRole("button", { name: "Registrar pedido" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível registrar o pedido."),
    );
    expect(screen.getByLabelText("Novo pedido")).toHaveValue("Orem por mim");
  });
});
