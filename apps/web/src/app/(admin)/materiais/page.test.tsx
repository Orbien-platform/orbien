import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import MateriaisPage from "./page";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/materials/MaterialFormModal", () => ({
  MaterialFormModal: ({ open, onSaved }: { open: boolean; onSaved: () => void }) =>
    open ? (
      <div data-testid="material-form">
        <button onClick={onSaved}>simular salvar</button>
      </div>
    ) : null,
}));

const mockedApi = vi.mocked(api, true);

function setup(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "u1", name: "Ana", email: "a@a.com", roles, tenant_id: "t1", congregation_id: "c1",
      support_session: false, support_tenant_name: null, areas: null,
      expires_at: Math.floor(Date.now() / 1000) + 300,
    },
    isLoading: false, isAuthenticated: true, login: vi.fn(), logout: vi.fn(),
  });
}

const past = "2026-01-10T12:00:00.000Z";
const future = "2999-01-10T12:00:00.000Z";

describe("MateriaisPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/networks") return Promise.resolve({ data: [{ id: "n1", name: "Norte" }] });
      return Promise.resolve({
        data: {
          data: [
            { id: "m1", title: "Estudo de Rute", audience: "all_networks", visibility: "all", publish_at: past, materialTargets: [] },
            { id: "m2", title: "Roteiro dos líderes", audience: "network", network_id: "n1", visibility: "leaders_only", publish_at: future, materialTargets: [] },
            { id: "m3", title: "Dinâmica", audience: "group", visibility: "all", publish_at: past, materialTargets: [{ small_group_id: "g1", smallGroup: { name: "Centro" } }] },
          ],
        },
      });
    });
  });

  it("lista os materiais com alcance, visibilidade e liberação", async () => {
    setup(["admin_congregation"]);
    render(<MateriaisPage />);

    expect(await screen.findByText("Estudo de Rute")).toBeInTheDocument();
    expect(screen.getByText("Todas as redes")).toBeInTheDocument();
    expect(screen.getByText("Rede Norte")).toBeInTheDocument();
    expect(screen.getByText("PG Centro")).toBeInTheDocument();
    expect(screen.getByText("Somente líderes")).toBeInTheDocument();
    expect(screen.getByText(/^Libera em/)).toBeInTheDocument();
    expect(screen.getAllByText(/^Liberado em/)).toHaveLength(2);
  });

  it("quem pode criar vê o botão e abre o formulário", async () => {
    setup(["secretary"]);
    const user = userEvent.setup();
    render(<MateriaisPage />);
    await screen.findByText("Estudo de Rute");

    await user.click(screen.getByRole("button", { name: /Novo material/ }));
    expect(screen.getByTestId("material-form")).toBeInTheDocument();

    mockedApi.get.mockClear();
    await user.click(screen.getByText("simular salvar"));
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith("/study-materials?limit=100"));
  });

  it("líder de PG lê a lista mas não vê o botão de criar", async () => {
    setup(["cell_leader"]);
    render(<MateriaisPage />);
    await screen.findByText("Estudo de Rute");
    expect(screen.queryByRole("button", { name: /Novo material/ })).not.toBeInTheDocument();
  });

  it("mostra estado de sem acesso quando a API responde 403", async () => {
    setup(["member"]);
    mockedApi.get.mockRejectedValue({ response: { status: 403 } });
    render(<MateriaisPage />);
    expect(await screen.findByText("Você não tem acesso a Materiais.")).toBeInTheDocument();
    expect(screen.queryByText("Estudo de Rute")).not.toBeInTheDocument();
  });

  it("falha que não é 403 mostra erro com nova tentativa, não 'nenhum material'", async () => {
    setup(["admin_congregation"]);
    mockedApi.get.mockRejectedValueOnce({ response: { status: 500 } });
    const user = userEvent.setup();
    render(<MateriaisPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os materiais.");
    expect(screen.queryByText(/Nenhum material ainda/)).not.toBeInTheDocument();

    mockedApi.get.mockImplementation((url: string) =>
      url === "/networks"
        ? Promise.resolve({ data: [] })
        : Promise.resolve({
            data: { data: [{ id: "m1", title: "Voltou", audience: "all_networks", visibility: "all", publish_at: "2026-01-10T12:00:00.000Z", materialTargets: [] }] },
          })
    );
    await user.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(await screen.findByText("Voltou")).toBeInTheDocument();
  });

  it("rótulos de alcance quando faltam dados: rede sem id, rede desconhecida, PG sem nome", async () => {
    setup(["admin_congregation"]);
    mockedApi.get.mockImplementation((url: string) =>
      url === "/networks"
        ? Promise.resolve({ data: [] })
        : Promise.resolve({
            data: {
              data: [
                { id: "a", title: "Sem rede", audience: "network", visibility: "all", publish_at: "2026-01-10T12:00:00.000Z", materialTargets: [] },
                { id: "b", title: "Rede sumida", audience: "network", network_id: "n9", visibility: "all", publish_at: "2026-01-10T12:00:00.000Z", materialTargets: [] },
                { id: "c", title: "Sem PG", audience: "group", visibility: "all", publish_at: "2026-01-10T12:00:00.000Z", materialTargets: [] },
              ],
            },
          })
    );
    render(<MateriaisPage />);

    expect(await screen.findByText("Uma rede")).toBeInTheDocument();
    expect(screen.getByText("Rede")).toBeInTheDocument();
    expect(screen.getByText("Um PG")).toBeInTheDocument();
  });

  it("sem usuário carregado a lista aparece sem o botão de criar; resposta sem lista vira vazia", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null, isLoading: false, isAuthenticated: false, login: vi.fn(), logout: vi.fn(),
    });
    mockedApi.get.mockImplementation((url: string) =>
      url === "/networks" ? Promise.resolve({ data: [] }) : Promise.resolve({ data: {} })
    );
    render(<MateriaisPage />);

    expect(await screen.findByText(/Nenhum material ainda/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Novo material/ })).not.toBeInTheDocument();
  });

  it("sair da tela antes da resposta não atualiza o estado, com sucesso ou com falha", async () => {
    setup(["admin_congregation"]);
    let resolveList: (v: unknown) => void = () => {};
    mockedApi.get.mockImplementation((url: string) =>
      url === "/networks"
        ? Promise.resolve({ data: [] })
        : new Promise((resolve) => { resolveList = resolve; })
    );
    const first = render(<MateriaisPage />);
    first.unmount();
    resolveList({ data: { data: [] } });
    await Promise.resolve();

    let rejectList: (e: unknown) => void = () => {};
    mockedApi.get.mockImplementation((url: string) =>
      url === "/networks"
        ? Promise.resolve({ data: [] })
        : new Promise((_resolve, reject) => { rejectList = reject; })
    );
    const second = render(<MateriaisPage />);
    second.unmount();
    rejectList({ response: { status: 500 } });
    await Promise.resolve();

    expect(mockedApi.get).toHaveBeenCalled();
  });
});
