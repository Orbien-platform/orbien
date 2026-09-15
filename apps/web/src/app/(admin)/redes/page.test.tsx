import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import RedesPage from "./page";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
  default: { get: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("@/components/networks/NetworkFormModal", () => ({
  NetworkFormModal: ({
    open,
    network,
    onSaved,
  }: {
    open: boolean;
    network: { id: string | null; name: string } | null;
    onSaved: () => void;
  }) =>
    open ? (
      <div data-testid="network-form-modal">
        form:{network?.id ?? "novo"}
        <button onClick={onSaved}>simular salvar</button>
      </div>
    ) : null,
}));

const mockedApi = vi.mocked(api, true);
const mockedUseAuth = vi.mocked(useAuth);

function setup(roles: string[] = ["admin_congregation"]) {
  mockedUseAuth.mockReturnValue({
    user: {
      id: "u1",
      name: "Ana",
      email: "ana@a.com",
      roles,
      tenant_id: "t1",
      congregation_id: "c1",
      support_session: false,
      support_tenant_name: null,
      areas: null,
      expires_at: Math.floor(Date.now() / 1000) + 300,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function mockApi(opts: {
  networks?: unknown[];
  networksError?: unknown;
  goalStatusByNetwork?: Record<string, unknown>;
  smallGroups?: unknown[];
}) {
  mockedApi.get.mockImplementation((url: string) => {
    if (url === "/networks") {
      return opts.networksError
        ? Promise.reject(opts.networksError)
        : Promise.resolve({ data: opts.networks ?? [] });
    }
    const goalMatch = url.match(/^\/networks\/(.+)\/goal-status$/);
    if (goalMatch) {
      const status = opts.goalStatusByNetwork?.[goalMatch[1]];
      return status
        ? Promise.resolve({ data: status })
        : Promise.reject(new Error("no status"));
    }
    if (url.startsWith("/small-groups")) {
      return Promise.resolve({ data: { data: opts.smallGroups ?? [] } });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RedesPage", () => {
  it("carrega e mostra a lista de redes com o status da meta", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: 80 }],
      goalStatusByNetwork: {
        n1: { goal_pct: 80, current_pct: 80, met: true, green: 4, yellow: 0, red: 1, total: 5 },
      },
    });

    render(<RedesPage />);

    expect(await screen.findByText("Rede Central")).toBeInTheDocument();
    expect(await screen.findByText("80% de 80% (atingida)")).toBeInTheDocument();
    expect(screen.getByText("1 rede")).toBeInTheDocument();
  });

  it("mostra 'Sem células' quando a rede não tem nenhuma célula vinculada", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Vazia", leader_person_id: null, health_goal_pct: 50 }],
      goalStatusByNetwork: {
        n1: { goal_pct: 50, current_pct: null, met: null, green: 0, yellow: 0, red: 0, total: 0 },
      },
    });

    render(<RedesPage />);

    expect(await screen.findByText("Sem células")).toBeInTheDocument();
  });

  it("403 em /networks mostra NoAccessState, não 'nenhuma rede'", async () => {
    setup();
    mockApi({ networksError: { response: { status: 403 } } });

    render(<RedesPage />);

    expect(await screen.findByText("Você não tem acesso a Redes.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma rede cadastrada.")).not.toBeInTheDocument();
  });

  it("abre o modal de criação e recarrega a lista ao salvar", async () => {
    setup();
    mockApi({ networks: [] });
    const user = userEvent.setup();
    render(<RedesPage />);
    await screen.findByText("Nenhuma rede cadastrada.");

    await user.click(screen.getByRole("button", { name: "Nova rede" }));
    expect(screen.getByTestId("network-form-modal")).toHaveTextContent("form:novo");

    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular salvar" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("abre o modal de edição pré-preenchido a partir de uma rede existente", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: "p1", health_goal_pct: 80 }],
      goalStatusByNetwork: {
        n1: { goal_pct: 80, current_pct: 80, met: true, green: 1, yellow: 0, red: 0, total: 1 },
      },
    });
    const user = userEvent.setup();
    render(<RedesPage />);
    await screen.findByText("Rede Central");

    await user.click(screen.getByRole("button", { name: "Editar rede" }));
    expect(screen.getByTestId("network-form-modal")).toHaveTextContent("form:n1");
  });

  it("esconde o botão de nova rede e de editar para quem não tem papel de gestão", async () => {
    setup(["member"]);
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
    });
    render(<RedesPage />);
    await screen.findByText("Rede Central");

    expect(screen.queryByRole("button", { name: "Nova rede" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar rede" })).not.toBeInTheDocument();
  });

  it("vincula uma célula sem rede à rede selecionada", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
      goalStatusByNetwork: {
        n1: { goal_pct: null, current_pct: 100, met: null, green: 1, yellow: 0, red: 0, total: 1 },
      },
      smallGroups: [
        { id: "g1", name: "Célula Vinculada", network_id: "n1" },
        { id: "g2", name: "Célula Livre", network_id: null },
      ],
    });
    mockedApi.patch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<RedesPage />);

    await user.click(await screen.findByText("Rede Central"));

    expect(await screen.findByText("Célula Vinculada")).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Selecione uma célula sem rede/ }),
      "g2",
    );
    await user.click(screen.getByRole("button", { name: "Vincular" }));

    await waitFor(() =>
      expect(mockedApi.patch).toHaveBeenCalledWith("/small-groups/g2", { network_id: "n1" }),
    );
  });

  it("desvincula uma célula já vinculada à rede", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
      goalStatusByNetwork: {
        n1: { goal_pct: null, current_pct: 100, met: null, green: 1, yellow: 0, red: 0, total: 1 },
      },
      smallGroups: [{ id: "g1", name: "Célula Vinculada", network_id: "n1" }],
    });
    mockedApi.patch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<RedesPage />);

    await user.click(await screen.findByText("Rede Central"));
    await screen.findByText("Célula Vinculada");

    await user.click(screen.getByRole("button", { name: "Desvincular Célula Vinculada" }));

    await waitFor(() =>
      expect(mockedApi.patch).toHaveBeenCalledWith("/small-groups/g1", { network_id: null }),
    );
  });

  it("não quebra e esconde as ações de gestão quando o usuário ainda não carregou", async () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockApi({ networks: [] });

    render(<RedesPage />);
    await screen.findByText("Nenhuma rede cadastrada.");

    expect(screen.queryByRole("button", { name: "Nova rede" })).not.toBeInTheDocument();
  });

  it("mostra a meta não atingida quando a rede tem meta e não bateu", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: 80 }],
      goalStatusByNetwork: {
        n1: { goal_pct: 80, current_pct: 40, met: false, green: 2, yellow: 0, red: 3, total: 5 },
      },
    });

    render(<RedesPage />);

    expect(await screen.findByText("40% de 80% (não atingida)")).toBeInTheDocument();
  });

  it("concede canEdit para quem tem só o papel tenant_admin", async () => {
    setup(["tenant_admin"]);
    mockApi({ networks: [] });

    render(<RedesPage />);
    await screen.findByText("Nenhuma rede cadastrada.");

    expect(screen.getByRole("button", { name: "Nova rede" })).toBeInTheDocument();
  });

  it("concede canEdit para quem tem só o papel pastor", async () => {
    setup(["pastor"]);
    mockApi({ networks: [] });

    render(<RedesPage />);
    await screen.findByText("Nenhuma rede cadastrada.");

    expect(screen.getByRole("button", { name: "Nova rede" })).toBeInTheDocument();
  });

  it("mostra o contador no plural com duas ou mais redes", async () => {
    setup();
    mockApi({
      networks: [
        { id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null },
        { id: "n2", name: "Rede Sul", leader_person_id: null, health_goal_pct: null },
      ],
    });

    render(<RedesPage />);

    expect(await screen.findByText("2 redes")).toBeInTheDocument();
  });

  it("descarta a resposta de /networks se o componente desmontar antes dela chegar", async () => {
    let resolveNetworks!: (value: { data: unknown }) => void;
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/networks") return new Promise((resolve) => { resolveNetworks = resolve; });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const { unmount } = render(<RedesPage />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith("/networks"));
    unmount();

    resolveNetworks({
      data: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
    });
  });

  it("descarta a falha de /networks se o componente desmontar antes dela chegar", async () => {
    let rejectNetworks!: (error: unknown) => void;
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/networks") return new Promise((_resolve, reject) => { rejectNetworks = reject; });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const { unmount } = render(<RedesPage />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith("/networks"));
    unmount();

    rejectNetworks(new Error("network down"));
  });

  it("descarta as respostas de goal-status se o componente desmontar antes delas chegarem", async () => {
    let resolveGoalStatus!: (value: { data: unknown }) => void;
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/networks")
        return Promise.resolve({
          data: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
        });
      if (url === "/networks/n1/goal-status")
        return new Promise((resolve) => { resolveGoalStatus = resolve; });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const { unmount } = render(<RedesPage />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith("/networks/n1/goal-status"));
    unmount();

    resolveGoalStatus({ data: { goal_pct: null, current_pct: 100, met: null, green: 1, yellow: 0, red: 0, total: 1 } });
  });

  it("trata a lista de células sem a chave `data` como vazia ao gerenciar uma rede", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/networks")
        return Promise.resolve({
          data: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
        });
      if (url === "/networks/n1/goal-status")
        return Promise.resolve({ data: { goal_pct: null, current_pct: 100, met: null, green: 1, yellow: 0, red: 0, total: 1 } });
      if (url === "/small-groups?limit=100") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    const user = userEvent.setup();

    render(<RedesPage />);
    await user.click(await screen.findByText("Rede Central"));

    expect(await screen.findByText("Nenhuma célula vinculada.")).toBeInTheDocument();
  });

  it("abre o modal de gerenciar pelo botão dedicado, sem depender do clique na linha", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
      goalStatusByNetwork: {
        n1: { goal_pct: null, current_pct: 100, met: null, green: 1, yellow: 0, red: 0, total: 1 },
      },
      smallGroups: [],
    });
    const user = userEvent.setup();

    render(<RedesPage />);
    await screen.findByText("Rede Central");
    await user.click(screen.getByRole("button", { name: "Gerenciar células" }));

    expect(await screen.findByText("Células de Rede Central")).toBeInTheDocument();
  });

  it("esvazia a lista de células ao falhar o carregamento do gerenciamento", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/networks")
        return Promise.resolve({
          data: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
        });
      if (url === "/networks/n1/goal-status")
        return Promise.resolve({ data: { goal_pct: null, current_pct: 100, met: null, green: 1, yellow: 0, red: 0, total: 1 } });
      if (url === "/small-groups?limit=100") return Promise.reject(new Error("network down"));
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    const user = userEvent.setup();

    render(<RedesPage />);
    await user.click(await screen.findByText("Rede Central"));

    expect(await screen.findByText("Nenhuma célula vinculada.")).toBeInTheDocument();
  });

  it("fecha o modal de gerenciar ao pressionar Esc", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
      goalStatusByNetwork: {
        n1: { goal_pct: null, current_pct: 100, met: null, green: 1, yellow: 0, red: 0, total: 1 },
      },
      smallGroups: [],
    });
    const user = userEvent.setup();

    render(<RedesPage />);
    await user.click(await screen.findByText("Rede Central"));
    await screen.findByText("Células de Rede Central");

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByText("Células de Rede Central")).not.toBeInTheDocument()
    );
  });

  it("mostra erro ao falhar em desvincular célula", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
      goalStatusByNetwork: {
        n1: { goal_pct: null, current_pct: 100, met: null, green: 1, yellow: 0, red: 0, total: 1 },
      },
      smallGroups: [{ id: "g1", name: "Célula Vinculada", network_id: "n1" }],
    });
    mockedApi.patch.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<RedesPage />);

    await user.click(await screen.findByText("Rede Central"));
    await user.click(await screen.findByRole("button", { name: "Desvincular Célula Vinculada" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao desvincular célula.");
  });

  it("mostra erro ao falhar em vincular célula", async () => {
    setup();
    mockApi({
      networks: [{ id: "n1", name: "Rede Central", leader_person_id: null, health_goal_pct: null }],
      goalStatusByNetwork: {
        n1: { goal_pct: null, current_pct: null, met: null, green: 0, yellow: 0, red: 0, total: 0 },
      },
      smallGroups: [{ id: "g2", name: "Célula Livre", network_id: null }],
    });
    mockedApi.patch.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<RedesPage />);

    await user.click(await screen.findByText("Rede Central"));
    await user.selectOptions(
      await screen.findByRole("combobox", { name: /Selecione uma célula sem rede/ }),
      "g2",
    );
    await user.click(screen.getByRole("button", { name: "Vincular" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao vincular célula.");
  });
});
