import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditoriaPage from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const getMock = vi.mocked(api.get);

function registro(overrides: Record<string, unknown> = {}) {
  return {
    id: "a-1",
    at: "2026-09-01T14:30:00.000Z",
    tenant_id: "t-1",
    tenant_slug: "doca-church",
    tenant_name: "Doca Church",
    actor_user_id: "u-1",
    actor_email: "suporte@orbien.app",
    route: "/persons",
    method: "GET",
    status: 200,
    ...overrides,
  };
}

function respondeCom(data: unknown[], total = data.length) {
  getMock.mockResolvedValue({ data: { data, total } } as never);
}

beforeEach(() => {
  getMock.mockReset();
  respondeCom([registro()]);
});

describe("AuditoriaPage", () => {
  it("busca o rastro de support_access e mostra quem, onde e o quê", async () => {
    render(<AuditoriaPage />);

    expect(await screen.findByText("suporte@orbien.app")).toBeInTheDocument();
    // O filtro por `action: 'support_access'` é fixo no backend — a tela
    // responde uma pergunta só.
    expect(getMock).toHaveBeenCalledWith(
      "/platform/audit-logs/support-access?limit=100"
    );
    expect(screen.getByText("Doca Church")).toBeInTheDocument();
    expect(screen.getByText("doca-church")).toBeInTheDocument();
    expect(screen.getByText("GET /persons")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText(/1 registro\./)).toBeInTheDocument();
  });

  it("é somente leitura — `audit_logs` só aceita INSERT por `audit_insert()`", async () => {
    render(<AuditoriaPage />);
    await screen.findByText("suporte@orbien.app");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("pluraliza a contagem", async () => {
    respondeCom([registro(), registro({ id: "a-2" })], 2);

    render(<AuditoriaPage />);

    expect(await screen.findByText(/2 registros\./)).toBeInTheDocument();
  });

  it("cai no id quando falta e-mail, nome ou slug do tenant", async () => {
    respondeCom([
      registro({
        actor_email: null,
        tenant_name: null,
        tenant_slug: null,
        method: null,
        status: null,
      }),
    ]);

    render(<AuditoriaPage />);

    const tabela = await screen.findByRole("table");
    expect(within(tabela).getByText("u-1")).toBeInTheDocument();
    expect(within(tabela).getByText("t-1")).toBeInTheDocument();
    // Sem método, a rota aparece sozinha; sem status, traço.
    expect(within(tabela).getByText("/persons")).toBeInTheDocument();
    expect(within(tabela).getAllByText("—")).toHaveLength(2);
  });

  it("erro que chega depois da desmontagem também é descartado", async () => {
    let rejeitar!: (e: unknown) => void;
    getMock.mockImplementation(
      () => new Promise((_, reject) => (rejeitar = reject)) as never
    );

    const { unmount } = render(<AuditoriaPage />);
    unmount();

    rejeitar(new Error("500"));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    );
  });

  it("erro na busca mostra o estado de erro da tabela, não o de lista vazia", async () => {
    getMock.mockRejectedValue(new Error("500"));

    render(<AuditoriaPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar a auditoria de sessões de suporte."
    );
    expect(
      screen.queryByText("Nenhuma sessão de suporte registrada ainda.")
    ).not.toBeInTheDocument();
  });

  it("tentar de novo no erro de carregamento refaz a busca", async () => {
    const user = userEvent.setup();
    getMock.mockRejectedValue(new Error("500"));
    render(<AuditoriaPage />);
    await screen.findByRole("alert");

    respondeCom([registro({ actor_email: "recuperado@orbien.app" })]);
    await user.click(screen.getByRole("button", { name: /tentar de novo/i }));

    expect(
      await screen.findByText("recuperado@orbien.app")
    ).toBeInTheDocument();
  });

  it("resposta que chega depois da desmontagem é descartada", async () => {
    let resolver!: (v: unknown) => void;
    getMock.mockImplementation(
      () => new Promise((resolve) => (resolver = resolve)) as never
    );

    const { unmount } = render(<AuditoriaPage />);
    unmount();

    resolver({ data: { data: [registro()], total: 1 } });

    // O guard de cancelamento evita o setState depois do unmount; sem ele o
    // React reclamaria no console.
    await waitFor(() =>
      expect(screen.queryByText("suporte@orbien.app")).not.toBeInTheDocument()
    );
  });
});
