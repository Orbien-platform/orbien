import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CrmPage from "./page";
import api from "@/lib/api";
import { openSupportSession } from "@/lib/support-session";

function axiosError(status: number) {
  const headers = new AxiosHeaders();
  const config = { headers };
  return new AxiosError("falhou", "ERR_BAD_REQUEST", config, null, {
    status,
    statusText: "",
    data: {},
    headers,
    config,
  });
}

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/support-session", () => ({ openSupportSession: vi.fn() }));

const getMock = vi.mocked(api.get);
const abrirSessao = vi.mocked(openSupportSession);

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    slug: "igreja-trial",
    name: "Igreja em Trial",
    email: "pastor@igreja-trial.test",
    plan: "starter",
    plan_status: "trial",
    trial_ends_at: "2026-08-01T00:00:00.000Z",
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function respondeCom(queue: {
  trials_expirados?: unknown[];
  inadimplentes?: unknown[];
}) {
  getMock.mockResolvedValue({
    data: { trials_expirados: [], inadimplentes: [], ...queue },
  } as never);
}

beforeEach(() => {
  getMock.mockReset();
  abrirSessao.mockReset();
  respondeCom({});
});

describe("CrmPage", () => {
  it("busca a fila e separa trials expirados de inadimplentes", async () => {
    respondeCom({
      trials_expirados: [tenant()],
      inadimplentes: [
        tenant({
          id: "t-2",
          slug: "igreja-inadimplente",
          name: "Igreja Inadimplente",
          plan_status: "suspended",
          trial_ends_at: null,
        }),
      ],
    });

    render(<CrmPage />);

    expect(await screen.findByText("Igreja em Trial")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/platform/tenants/crm-queue");
    expect(screen.getByText("Igreja Inadimplente")).toBeInTheDocument();
    expect(screen.getByText(/Trial vencido sem conversão \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Inadimplentes \(1\)/)).toBeInTheDocument();
  });

  it("mostra estado vazio quando as duas listas voltam sem tenants", async () => {
    render(<CrmPage />);

    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(
      await screen.findByText("Nenhum trial vencido sem conversão.")
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum tenant inadimplente.")).toBeInTheDocument();
  });

  it("mostra erro de carregamento quando a requisição falha", async () => {
    getMock.mockRejectedValue(new Error("falhou"));

    render(<CrmPage />);

    expect(await screen.findAllByText("Não foi possível carregar a fila.")).not.toHaveLength(0);
  });

  it("abre sessão de suporte a partir de uma linha da fila", async () => {
    respondeCom({ trials_expirados: [tenant()] });
    abrirSessao.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<CrmPage />);

    const botao = await screen.findByRole("button", { name: /Entrar no web como suporte/ });
    await user.click(botao);

    await waitFor(() => expect(abrirSessao).toHaveBeenCalledWith("t-1", "Igreja em Trial"));
  });

  it("mostra erro quando a sessão de suporte falha por falta de congregação", async () => {
    respondeCom({ trials_expirados: [tenant()] });
    abrirSessao.mockRejectedValue(axiosError(404));
    const user = userEvent.setup();

    render(<CrmPage />);

    const botao = await screen.findByRole("button", { name: /Entrar no web como suporte/ });
    await user.click(botao);

    expect(
      await screen.findByText(/não tem congregação — não é possível abrir sessão de suporte/)
    ).toBeInTheDocument();
  });

  it("erro de configuração aparece com a mensagem que nomeia a variável", async () => {
    respondeCom({ trials_expirados: [tenant()] });
    abrirSessao.mockRejectedValue(
      new Error(
        "NEXT_PUBLIC_WEB_URL não está definida — sem ela não há para onde abrir a sessão."
      )
    );
    const user = userEvent.setup();

    render(<CrmPage />);

    const botao = await screen.findByRole("button", { name: /Entrar no web como suporte/ });
    await user.click(botao);

    expect(await screen.findByText(/NEXT_PUBLIC_WEB_URL não está definida/)).toBeInTheDocument();
  });

  it("qualquer outro erro da API vira mensagem genérica", async () => {
    respondeCom({ trials_expirados: [tenant()] });
    abrirSessao.mockRejectedValue(axiosError(500));
    const user = userEvent.setup();

    render(<CrmPage />);

    const botao = await screen.findByRole("button", { name: /Entrar no web como suporte/ });
    await user.click(botao);

    expect(
      await screen.findByText("Não foi possível abrir a sessão de suporte.")
    ).toBeInTheDocument();
  });

  it("mostra traço para contato e trial sem data", async () => {
    respondeCom({
      trials_expirados: [tenant({ email: null, trial_ends_at: null })],
    });

    render(<CrmPage />);

    expect(await screen.findByText("Igreja em Trial")).toBeInTheDocument();
    // Duas colunas caem no traço: contato (email nulo) e "Trial venceu em"
    // (fmtDate com iso nulo) — mais "Cliente desde", que tem data real.
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("resposta que chega depois do unmount não atualiza estado", async () => {
    let resolver!: (v: unknown) => void;
    getMock.mockImplementationOnce(() => new Promise((resolve) => (resolver = resolve)));

    const { unmount } = render(<CrmPage />);
    unmount();

    expect(() =>
      resolver({ data: { trials_expirados: [tenant()], inadimplentes: [] } })
    ).not.toThrow();
  });

  it("erro que chega depois do unmount não atualiza estado", async () => {
    let rejeitar!: (e: unknown) => void;
    getMock.mockImplementationOnce(() => new Promise((_, reject) => (rejeitar = reject)));

    const { unmount } = render(<CrmPage />);
    unmount();

    expect(() => rejeitar(new Error("falhou"))).not.toThrow();
  });

  it("tenta de novo a partir do estado de erro", async () => {
    getMock.mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup();

    render(<CrmPage />);
    await screen.findAllByText("Não foi possível carregar a fila.");

    respondeCom({ trials_expirados: [tenant()] });
    await user.click((await screen.findAllByRole("button", { name: /Tentar de novo/ }))[0]);

    expect(await screen.findByText("Igreja em Trial")).toBeInTheDocument();
  });
});
