import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { EventRegistrationsPanel } from "./EventRegistrationsPanel";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const mockedApi = vi.mocked(api, true);

function registration(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "r1",
    full_name: "Maria Membro",
    email: "maria@ex.com",
    phone: null,
    status: "confirmed",
    created_at: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

function respondWith(overrides: Partial<Record<string, unknown>> = {}) {
  mockedApi.get.mockResolvedValue({
    data: {
      data: [registration()],
      registration_enabled: true,
      registration_limit: null,
      registration_deadline: null,
      registrations_closed: false,
      confirmed_count: 1,
      waitlisted_count: 0,
      seats_left: null,
      ...overrides,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EventRegistrationsPanel", () => {
  it("mostra a contagem e a lista de inscritos", async () => {
    respondWith();

    render(<EventRegistrationsPanel postId="p1" />);

    expect(await screen.findByText("Maria Membro")).toBeInTheDocument();
    expect(screen.getByText("1 confirmada")).toBeInTheDocument();
  });

  it("com limite, a contagem diz de quantas vagas — e a fila aparece à parte", async () => {
    respondWith({
      data: [registration(), registration({ id: "r2", full_name: "João", status: "waitlisted" })],
      registration_limit: 1,
      confirmed_count: 1,
      waitlisted_count: 1,
      seats_left: 0,
    });

    render(<EventRegistrationsPanel postId="p1" />);

    expect(await screen.findByText(/1 confirmada de 1/)).toBeInTheDocument();
    expect(screen.getByText(/1 na fila de espera/)).toBeInTheDocument();
    expect(screen.getByText("Fila de espera")).toBeInTheDocument();
  });

  it("evento sem inscrição aberta diz isso, em vez de lista vazia", async () => {
    respondWith({ data: [], registration_enabled: false, confirmed_count: 0 });

    render(<EventRegistrationsPanel postId="p1" />);

    expect(await screen.findByText(/Este evento está sem inscrição/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inscrever" })).not.toBeInTheDocument();
  });

  it("inscrição aberta e ninguém inscrito não se confunde com inscrição fechada", async () => {
    respondWith({ data: [], confirmed_count: 0 });

    render(<EventRegistrationsPanel postId="p1" />);

    expect(await screen.findByText(/Ninguém se inscreveu ainda/)).toBeInTheDocument();
  });

  it("403 some com o painel — a lista é do organizador, e não é `sem inscritos`", async () => {
    mockedApi.get.mockRejectedValue({ response: { status: 403 } });

    const { container } = render(<EventRegistrationsPanel postId="p1" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("falha que não é 403 oferece tentar de novo", async () => {
    mockedApi.get.mockRejectedValue({ response: { status: 500 } });

    render(<EventRegistrationsPanel postId="p1" />);

    expect(await screen.findByText(/Não foi possível carregar as inscrições/)).toBeInTheDocument();

    respondWith();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByText("Maria Membro")).toBeInTheDocument();
  });

  it("inscreve alguém e recarrega a lista", async () => {
    respondWith();
    mockedApi.post.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<EventRegistrationsPanel postId="p1" />);
    await screen.findByText("Maria Membro");

    await user.click(screen.getByRole("button", { name: /Inscrever/ }));
    await user.type(screen.getByLabelText(/Nome/), "João Convidado");
    await user.type(screen.getByLabelText(/E-mail/), "joao@ex.com");
    await user.click(screen.getByRole("button", { name: "Inscrever" }));

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith("/content/posts/p1/registrations", {
        full_name: "João Convidado",
        email: "joao@ex.com",
      })
    );
    // Duas cargas: a inicial e a de depois de inscrever.
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(2));
  });

  it("nome vazio nem chega à API", async () => {
    respondWith();
    const user = userEvent.setup();

    render(<EventRegistrationsPanel postId="p1" />);
    await screen.findByText("Maria Membro");

    await user.click(screen.getByRole("button", { name: /Inscrever/ }));
    await user.click(screen.getByRole("button", { name: "Inscrever" }));

    expect(await screen.findByText("Nome é obrigatório.")).toBeInTheDocument();
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("409 vira a mensagem que o organizador consegue agir, não `erro ao inscrever`", async () => {
    respondWith();
    mockedApi.post.mockRejectedValue({ response: { status: 409 } });
    const user = userEvent.setup();

    render(<EventRegistrationsPanel postId="p1" />);
    await screen.findByText("Maria Membro");

    await user.click(screen.getByRole("button", { name: /Inscrever/ }));
    await user.type(screen.getByLabelText(/Nome/), "Maria Membro");
    await user.click(screen.getByRole("button", { name: "Inscrever" }));

    expect(await screen.findByText(/já está inscrita neste evento/)).toBeInTheDocument();
  });

  it("cancela uma inscrição pelo id e recarrega", async () => {
    respondWith();
    mockedApi.delete.mockResolvedValue({ data: {} });
    const user = userEvent.setup();

    render(<EventRegistrationsPanel postId="p1" />);
    await screen.findByText("Maria Membro");

    await user.click(screen.getByRole("button", { name: "Cancelar inscrição de Maria Membro" }));

    await waitFor(() =>
      expect(mockedApi.delete).toHaveBeenCalledWith("/content/posts/p1/registrations/r1")
    );
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(2));
  });

  it("inscrito sem e-mail aparece como `sem e-mail`, não em branco", async () => {
    respondWith({ data: [registration({ email: null })] });

    render(<EventRegistrationsPanel postId="p1" />);

    expect(await screen.findByText(/sem e-mail/)).toBeInTheDocument();
  });

  it("falha que não é 409 vira a mensagem genérica, não a de duplicado", async () => {
    respondWith();
    mockedApi.post.mockRejectedValue({ response: { status: 500 } });
    const user = userEvent.setup();

    render(<EventRegistrationsPanel postId="p1" />);
    await screen.findByText("Maria Membro");

    await user.click(screen.getByRole("button", { name: /Inscrever/ }));
    await user.type(screen.getByLabelText(/Nome/), "João");
    await user.click(screen.getByRole("button", { name: "Inscrever" }));

    expect(await screen.findByText("Não foi possível inscrever. Tente novamente.")).toBeInTheDocument();
  });

  it("falha ao cancelar não some em silêncio", async () => {
    respondWith();
    mockedApi.delete.mockRejectedValue({ response: { status: 500 } });
    const user = userEvent.setup();

    render(<EventRegistrationsPanel postId="p1" />);
    await screen.findByText("Maria Membro");

    await user.click(screen.getByRole("button", { name: "Cancelar inscrição de Maria Membro" }));

    expect(await screen.findByText("Não foi possível cancelar a inscrição.")).toBeInTheDocument();
  });

  it("desistir de inscrever fecha o formulário e limpa o erro", async () => {
    respondWith();
    const user = userEvent.setup();

    render(<EventRegistrationsPanel postId="p1" />);
    await screen.findByText("Maria Membro");

    await user.click(screen.getByRole("button", { name: /Inscrever/ }));
    await user.click(screen.getByRole("button", { name: "Inscrever" }));
    expect(await screen.findByText("Nome é obrigatório.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText(/Nome/)).not.toBeInTheDocument();
    expect(screen.queryByText("Nome é obrigatório.")).not.toBeInTheDocument();
  });

  // Desmontar no meio da requisição é o que o `signal.cancelled` existe para
  // cobrir: sem ele, a resposta que chega depois chama setState em componente
  // já desmontado.
  it("resposta que chega depois do desmonte não é aplicada", async () => {
    let resolver: (v: unknown) => void = () => {};
    mockedApi.get.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      })
    );

    const { unmount } = render(<EventRegistrationsPanel postId="p1" />);
    unmount();
    resolver({
      data: {
        data: [registration()],
        registration_enabled: true,
        registration_limit: null,
        registration_deadline: null,
        registrations_closed: false,
        confirmed_count: 1,
        waitlisted_count: 0,
        seats_left: null,
      },
    });

    await waitFor(() => expect(screen.queryByText("Maria Membro")).not.toBeInTheDocument());
  });

  it("erro que chega depois do desmonte também não é aplicado", async () => {
    let rejecter: (e: unknown) => void = () => {};
    mockedApi.get.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejecter = reject;
      })
    );

    const { unmount } = render(<EventRegistrationsPanel postId="p1" />);
    unmount();
    rejecter({ response: { status: 500 } });

    await waitFor(() =>
      expect(screen.queryByText(/Não foi possível carregar/)).not.toBeInTheDocument()
    );
  });

  it("o prazo aparece, e diz se já passou", async () => {
    respondWith({ registration_deadline: "2026-09-20T00:00:00.000Z" });
    const { unmount } = render(<EventRegistrationsPanel postId="p1" />);
    expect(await screen.findByText(/Inscrições até/)).toBeInTheDocument();
    unmount();

    respondWith({ registration_deadline: "2026-09-01T00:00:00.000Z", registrations_closed: true });
    render(<EventRegistrationsPanel postId="p1" />);
    expect(await screen.findByText(/Prazo encerrado em/)).toBeInTheDocument();
  });
});
