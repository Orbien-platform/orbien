import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import VoluntariosPage from "./page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("@/components/volunteers/CreateMinistryModal", () => ({
  CreateMinistryModal: ({ open, onCreated }: { open: boolean; onCreated: () => void }) =>
    open ? (
      <div data-testid="create-ministry-modal">
        <button onClick={onCreated}>simular criação</button>
      </div>
    ) : null,
}));
vi.mock("@/components/volunteers/MinistryDetailSheet", () => ({
  MinistryDetailSheet: ({
    open,
    ministryId,
    onUpdated,
    onSelectMinistry,
  }: {
    open: boolean;
    ministryId: string | null;
    onUpdated: () => void;
    onSelectMinistry: (id: string) => void;
  }) =>
    open ? (
      <div data-testid="ministry-detail-sheet">
        sheet:{ministryId}
        <button onClick={onUpdated}>simular atualização</button>
        <button onClick={() => onSelectMinistry("m2")}>simular troca de ministério</button>
      </div>
    ) : null,
}));
vi.mock("@/components/volunteers/MinistryTree", () => ({
  MinistryTree: ({
    nodes,
    onSelect,
  }: {
    nodes: { id: string; name: string }[];
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="ministry-tree">
      {nodes.map((n) => (
        <button key={n.id} onClick={() => onSelect(n.id)}>
          {n.name}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/volunteers/UnavailabilityPanel", () => ({
  UnavailabilityPanel: () => <div data-testid="unavailability-panel" />,
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
      expires_at: Math.floor(Date.now() / 1000) + 300,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VoluntariosPage", () => {
  it("carrega a árvore de ministérios e as contagens de líderes/voluntários", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") {
        return Promise.resolve({
          data: [{ id: "m1", name: "Louvor", children: [] }],
        });
      }
      if (url === "/volunteers/ministries/m1") {
        return Promise.resolve({ data: { leaders: [{ id: "l1" }], volunteers: [{ id: "v1" }, { id: "v2" }] } });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<VoluntariosPage />);
    expect(await screen.findByText("Louvor")).toBeInTheDocument();
    expect(screen.getByText("1 ministério")).toBeInTheDocument();
  });

  it("trata falha ao carregar ministérios mostrando estado vazio", async () => {
    setup();
    mockedApi.get.mockRejectedValue(new Error("boom"));
    render(<VoluntariosPage />);
    expect(
      await screen.findByText(/Nenhum ministério cadastrado\./)
    ).toBeInTheDocument();
    expect(screen.getByText(/Clique em "Novo ministério"/)).toBeInTheDocument();
  });

  it("ignora falha ao buscar a contagem de um ministério específico", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") {
        return Promise.resolve({ data: [{ id: "m1", name: "Louvor", children: [] }] });
      }
      if (url === "/volunteers/ministries/m1") return Promise.reject(new Error("boom"));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<VoluntariosPage />);
    expect(await screen.findByText("Louvor")).toBeInTheDocument();
  });

  it("trata usuário sem roles como não-admin (fallback ?? [])", async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        name: "Ana",
        email: "ana@a.com",
        roles: undefined as unknown as string[],
        tenant_id: "t1",
        congregation_id: "c1",
        support_session: false,
        support_tenant_name: null,
        expires_at: Math.floor(Date.now() / 1000) + 300,
      },
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockedApi.get.mockResolvedValue({ data: [] });
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    expect(screen.queryByRole("button", { name: /novo ministério/i })).not.toBeInTheDocument();
  });

  it("não mostra o botão de novo ministério nem a mensagem de criação para quem não é admin", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockResolvedValue({ data: [] });
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    expect(screen.queryByRole("button", { name: /novo ministério/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Clique em "Novo ministério"/)).not.toBeInTheDocument();
  });

  it("abre o modal de criação e o sheet de detalhe, recarregando ao concluir", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") {
        return Promise.resolve({ data: [{ id: "m1", name: "Louvor", children: [] }] });
      }
      return Promise.resolve({ data: { leaders: [], volunteers: [] } });
    });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText("Louvor");

    await user.click(screen.getByRole("button", { name: /novo ministério/i }));
    expect(screen.getByTestId("create-ministry-modal")).toBeInTheDocument();
    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));

    await user.click(screen.getByText("Louvor"));
    expect(await screen.findByTestId("ministry-detail-sheet")).toHaveTextContent("sheet:m1");
    const callsBeforeUpdate = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular atualização" }));
    await waitFor(() =>
      expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBeforeUpdate)
    );
  });

  it("mostra, confirma e recusa meus turnos na aba Meus Turnos", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") {
        return Promise.resolve({
          data: [
            {
              id: "a1",
              status: "pending",
              notified_at: null,
              responded_at: null,
              celebration: { id: "c1", name: "Culto Domingo" },
              ministry: { id: "m1", name: "Louvor" },
              scheduled_date: "2026-02-01T00:00:00Z",
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mockedApi.patch.mockResolvedValue({ data: {} });

    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);

    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    expect(await screen.findByText("Culto Domingo")).toBeInTheDocument();
    expect(screen.getByText("Pendente")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByText("Confirmado")).toBeInTheDocument());
    expect(mockedApi.patch).toHaveBeenCalledWith("/assignments/a1/respond", { status: "confirmed" });
  });

  it("recusa um turno pendente", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") {
        return Promise.resolve({
          data: [
            {
              id: "a1",
              status: "pending",
              notified_at: null,
              responded_at: null,
              celebration: { id: "c1", name: "Culto Domingo" },
              ministry: { id: "m1", name: "Louvor" },
              scheduled_date: "2026-02-01T00:00:00Z",
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mockedApi.patch.mockResolvedValue({ data: {} });

    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    await screen.findByText("Culto Domingo");

    await user.click(screen.getByRole("button", { name: "Recusar" }));
    await waitFor(() => expect(screen.getByText("Recusou")).toBeInTheDocument());
    expect(mockedApi.patch).toHaveBeenCalledWith("/assignments/a1/respond", { status: "declined" });
  });

  it("mostra erro ao falhar o carregamento de meus turnos e mensagem de lista vazia quando não há nenhum", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") return Promise.reject(new Error("boom"));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    expect(
      await screen.findByText("Não foi possível carregar seus turnos.")
    ).toBeInTheDocument();
  });

  it("mostra 'você não tem turnos' quando a lista vem vazia, e trata assignment sem celebração/ministério/data", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    expect(await screen.findByText("Você não tem turnos agendados.")).toBeInTheDocument();
  });

  it("mostra travessões quando o turno não traz celebração, ministério ou data", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") {
        return Promise.resolve({
          data: [
            {
              id: "a1",
              status: "confirmed",
              notified_at: null,
              responded_at: null,
              celebration: undefined as never,
              ministry: undefined as never,
              scheduled_date: "",
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    await screen.findByText("Confirmado");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("mostra o sufixo plural quando há mais de um ministério", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") {
        return Promise.resolve({
          data: [
            { id: "m1", name: "Louvor", children: [] },
            { id: "m2", name: "Mídia", children: [] },
          ],
        });
      }
      return Promise.resolve({ data: { leaders: [], volunteers: [] } });
    });
    render(<VoluntariosPage />);
    expect(await screen.findByText("2 ministérios")).toBeInTheDocument();
  });

  it("usa 0 como contagem quando a resposta de detalhe não traz leaders/volunteers", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") {
        return Promise.resolve({ data: [{ id: "m1", name: "Louvor", children: [] }] });
      }
      if (url === "/volunteers/ministries/m1") return Promise.resolve({ data: {} });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(<VoluntariosPage />);
    expect(await screen.findByText("Louvor")).toBeInTheDocument();
  });

  it("troca o ministério selecionado a partir do próprio sheet de detalhe", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") {
        return Promise.resolve({ data: [{ id: "m1", name: "Louvor", children: [] }] });
      }
      return Promise.resolve({ data: { leaders: [], volunteers: [] } });
    });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await user.click(await screen.findByText("Louvor"));
    expect(await screen.findByTestId("ministry-detail-sheet")).toHaveTextContent("sheet:m1");
    await user.click(screen.getByRole("button", { name: "simular troca de ministério" }));
    expect(screen.getByTestId("ministry-detail-sheet")).toHaveTextContent("sheet:m2");
  });

  it("trata resposta não-array de meus turnos como lista vazia", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") {
        return Promise.resolve({ data: { not: "an array" } });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    expect(await screen.findByText("Você não tem turnos agendados.")).toBeInTheDocument();
  });

  it("confirma só o turno clicado quando há mais de um na lista", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") {
        return Promise.resolve({
          data: [
            {
              id: "a1",
              status: "pending",
              notified_at: null,
              responded_at: null,
              celebration: { id: "c1", name: "Culto Um" },
              ministry: { id: "m1", name: "Louvor" },
              scheduled_date: "2026-02-01T00:00:00Z",
            },
            {
              id: "a2",
              status: "pending",
              notified_at: null,
              responded_at: null,
              celebration: { id: "c2", name: "Culto Dois" },
              ministry: { id: "m1", name: "Louvor" },
              scheduled_date: "2026-02-08T00:00:00Z",
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mockedApi.patch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    await screen.findByText("Culto Um");

    await user.click(screen.getAllByRole("button", { name: "Confirmar" })[0]);
    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalledWith("/assignments/a1/respond", { status: "confirmed" }));
    // O segundo turno continua pendente — só o clicado mudou de status.
    expect(screen.getAllByText("Pendente")).toHaveLength(1);
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
  });

  it("recusa só o turno clicado quando há mais de um na lista", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") {
        return Promise.resolve({
          data: [
            {
              id: "a1",
              status: "pending",
              notified_at: null,
              responded_at: null,
              celebration: { id: "c1", name: "Culto Um" },
              ministry: { id: "m1", name: "Louvor" },
              scheduled_date: "2026-02-01T00:00:00Z",
            },
            {
              id: "a2",
              status: "pending",
              notified_at: null,
              responded_at: null,
              celebration: { id: "c2", name: "Culto Dois" },
              ministry: { id: "m1", name: "Louvor" },
              scheduled_date: "2026-02-08T00:00:00Z",
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    mockedApi.patch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    await screen.findByText("Culto Um");

    await user.click(screen.getAllByRole("button", { name: "Recusar" })[0]);
    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalledWith("/assignments/a1/respond", { status: "declined" }));
    expect(screen.getAllByText("Pendente")).toHaveLength(1);
    expect(screen.getByText("Recusou")).toBeInTheDocument();
  });

  it("guarda contra a dupla invocação de efeito do StrictMode (não busca ministérios duas vezes)", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    render(
      <StrictMode>
        <VoluntariosPage />
      </StrictMode>
    );
    await screen.findByText(/Nenhum ministério cadastrado\./);
    expect(
      mockedApi.get.mock.calls.filter(([u]) => u === "/volunteers/ministries")
    ).toHaveLength(1);
  });

  it("guarda contra a dupla invocação de efeito do StrictMode (não busca meus turnos duas vezes)", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") return Promise.resolve({ data: [] });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(
      <StrictMode>
        <VoluntariosPage />
      </StrictMode>
    );
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    await screen.findByText("Você não tem turnos agendados.");
    expect(
      mockedApi.get.mock.calls.filter(([u]) => u === "/volunteers/my-celebration-assignments")
    ).toHaveLength(1);
  });

  it("cai no rótulo bruto quando o status do turno não é um dos três conhecidos", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/volunteers/ministries") return Promise.resolve({ data: [] });
      if (url === "/volunteers/my-celebration-assignments") {
        return Promise.resolve({
          data: [
            {
              id: "a1",
              status: "unknown_status",
              notified_at: null,
              responded_at: null,
              celebration: { id: "c1", name: "Culto Um" },
              ministry: { id: "m1", name: "Louvor" },
              scheduled_date: "2026-02-01T00:00:00Z",
            },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Meus Turnos" }));
    expect(await screen.findByText("unknown_status")).toBeInTheDocument();
  });

  it("mostra a aba de indisponibilidade", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<VoluntariosPage />);
    await screen.findByText(/Nenhum ministério cadastrado\./);
    await user.click(screen.getByRole("tab", { name: "Indisponibilidade" }));
    expect(await screen.findByTestId("unavailability-panel")).toBeInTheDocument();
  });
});
