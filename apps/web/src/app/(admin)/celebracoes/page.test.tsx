import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import CelebracoesPage from "./page";

vi.mock("@/lib/api", () => ({
  // Espelha o `isForbidden` real: 403 e só 403.
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
  default: { get: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("@/components/celebrations/CreateCelebrationModal", () => ({
  RECURRENCE_LABELS: { weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", none: "Não recorrente" },
  WEEKDAY_LABELS: ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"],
  CreateCelebrationModal: ({ open, onCreated }: { open: boolean; onCreated: () => void }) =>
    open ? (
      <div data-testid="create-celebration-modal">
        <button onClick={onCreated}>simular criação</button>
      </div>
    ) : null,
}));
vi.mock("@/components/celebrations/CelebrationDetailSheet", () => ({
  CelebrationDetailSheet: ({ open, celebrationId }: { open: boolean; celebrationId: string | null }) =>
    open ? <div data-testid="celebration-detail-sheet">detail:{celebrationId}</div> : null,
}));
vi.mock("@/components/celebrations/ScheduleSheet", () => ({
  ScheduleSheet: ({
    open,
    instanceId,
    onChanged,
  }: {
    open: boolean;
    instanceId: string | null;
    onChanged: () => void;
  }) =>
    open ? (
      <div data-testid="schedule-sheet">
        schedule:{instanceId}
        <button onClick={onChanged}>simular mudança</button>
      </div>
    ) : null,
}));
vi.mock("@/components/celebrations/TemplatesPanel", () => ({
  TemplatesPanel: ({ canEdit }: { canEdit: boolean }) => (
    <div data-testid="templates-panel">templates:{String(canEdit)}</div>
  ),
}));
vi.mock("@/components/celebrations/ServiceOrderView", () => ({
  ServiceOrderView: ({ open, instanceId }: { open: boolean; instanceId: string | null }) =>
    open ? <div data-testid="service-order-view">so:{instanceId}</div> : null,
}));

const mockedApi = vi.mocked(api, true);
const mockedUseAuth = vi.mocked(useAuth);

function setup(roles: string[] = ["tenant_admin"]) {
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
    support_expires_at: null,
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

describe("CelebracoesPage", () => {
  it("carrega e mostra a lista de celebrações", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: [{ id: "1", name: "Culto Domingo", day_of_week: 0, start_time: "10:00", recurrence: "weekly" }],
    });
    render(<CelebracoesPage />);
    expect(await screen.findByText("Culto Domingo")).toBeInTheDocument();
    expect(screen.getByText("Domingo · 10:00")).toBeInTheDocument();
    expect(screen.getByText("Semanal")).toBeInTheDocument();
    expect(screen.getByText("1 celebração")).toBeInTheDocument();
  });

  it("mostra travessão quando não há recorrência conhecida, dia da semana nem horário", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: [{ id: "1", name: "Evento", day_of_week: null, start_time: "", recurrence: "" }],
    });
    render(<CelebracoesPage />);
    await screen.findByText("Evento");
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("cai para o próprio valor de recorrência quando ele não está no dicionário", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: [{ id: "1", name: "Evento", day_of_week: 1, start_time: "08:00", recurrence: "custom_weird" }],
    });
    render(<CelebracoesPage />);
    await screen.findByText("Evento");
    expect(screen.getByText("custom_weird")).toBeInTheDocument();
  });

  it("trata resposta não-array e falha da API como lista vazia", async () => {
    setup();
    mockedApi.get.mockResolvedValueOnce({ data: { not: "array" } });
    const { unmount } = render(<CelebracoesPage />);
    expect(await screen.findByText("Nenhuma celebração cadastrada.")).toBeInTheDocument();
    unmount();

    mockedApi.get.mockRejectedValue(new Error("boom"));
    render(<CelebracoesPage />);
    expect(await screen.findByText("Nenhuma celebração cadastrada.")).toBeInTheDocument();
  });

  it("403 diz \"sem acesso\" nas duas abas, não \"nenhuma celebração\"", async () => {
    // Esta é a tela que originou a pendência nº 10: `volunteer` e `member`
    // levam 403 em `GET /celebrations` e liam "Nenhuma celebração cadastrada".
    setup();
    mockedApi.get.mockRejectedValue({ response: { status: 403 } });
    render(<CelebracoesPage />);

    expect(await screen.findByText("Você não tem acesso a Celebrações.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma celebração cadastrada.")).not.toBeInTheDocument();
  });

  it("trata usuário sem roles como sem permissão (fallback ?? [])", async () => {
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
    support_expires_at: null,
      },
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockedApi.get.mockResolvedValue({ data: [] });
    render(<CelebracoesPage />);
    await screen.findByText("Nenhuma celebração cadastrada.");
    expect(screen.queryByRole("button", { name: /nova celebração/i })).not.toBeInTheDocument();
  });

  it("mostra o sufixo plural e conta corretamente com mais de uma celebração", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: [
        { id: "1", name: "Culto Um", day_of_week: 0, start_time: "10:00", recurrence: "weekly" },
        { id: "2", name: "Culto Dois", day_of_week: 0, start_time: "18:00", recurrence: "weekly" },
      ],
    });
    render(<CelebracoesPage />);
    expect(await screen.findByText("2 celebrações")).toBeInTheDocument();
  });

  it("abre o modal também pelo botão do estado vazio", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Nenhuma celebração cadastrada.");
    const buttons = screen.getAllByRole("button", { name: /nova celebração/i });
    await user.click(buttons[buttons.length - 1]);
    expect(screen.getByTestId("create-celebration-modal")).toBeInTheDocument();
  });

  it("guarda contra a dupla invocação de efeito do StrictMode ao carregar celebrações", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: [] });
    render(
      <StrictMode>
        <CelebracoesPage />
      </StrictMode>
    );
    await screen.findByText("Nenhuma celebração cadastrada.");
    expect(
      mockedApi.get.mock.calls.filter(([u]) => u === "/celebrations")
    ).toHaveLength(1);
  });

  it("não mostra o botão de nova celebração para quem não pode editar", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockResolvedValue({ data: [] });
    render(<CelebracoesPage />);
    await screen.findByText("Nenhuma celebração cadastrada.");
    expect(screen.queryByRole("button", { name: /nova celebração/i })).not.toBeInTheDocument();
  });

  it("abre o modal de criação e recarrega ao concluir", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Nenhuma celebração cadastrada.");

    await user.click(screen.getAllByRole("button", { name: /nova celebração/i })[0]);
    expect(screen.getByTestId("create-celebration-modal")).toBeInTheDocument();
    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("abre o detalhe ao clicar em uma linha", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: [{ id: "9", name: "Clique Aqui", day_of_week: 0, start_time: "10:00", recurrence: "weekly" }],
    });
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await user.click(await screen.findByText("Clique Aqui"));
    expect(await screen.findByTestId("celebration-detail-sheet")).toHaveTextContent("detail:9");
  });

  it("mostra o painel de templates na aba Templates", async () => {
    setup(["volunteer"]);
    mockedApi.get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Nenhuma celebração cadastrada.");
    await user.click(screen.getByRole("tab", { name: "Templates" }));
    expect(await screen.findByTestId("templates-panel")).toHaveTextContent("templates:false");
  });

  it("carrega instâncias próximas ao entrar na aba, ordenadas por data e limitadas a 30", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/celebrations") {
        return Promise.resolve({
          data: [{ id: "c1", name: "Culto", day_of_week: 0, start_time: "10:00", recurrence: "weekly" }],
        });
      }
      if (url.startsWith("/celebrations/instances")) {
        return Promise.resolve({
          data: [
            { id: "i2", scheduled_date: "2026-02-10", celebration: { id: "c1", name: "Culto" }, serviceOrder: null, schedule: null },
            { id: "i1", scheduled_date: "2026-02-01", celebration: { id: "c1", name: "Culto" }, serviceOrder: { id: "so1" }, schedule: { id: "s1", status: "published" } },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Culto");
    await user.click(screen.getByRole("tab", { name: "Próximas" }));

    const items = await screen.findAllByText(/Culto/);
    expect(items.length).toBeGreaterThan(0);
    expect(screen.getByText("Com OC")).toBeInTheDocument();
    expect(screen.getByText("Sem OC")).toBeInTheDocument();
    expect(screen.getByText("Escala publicada")).toBeInTheDocument();
  });

  it("mostra rótulos de escala para sem-schedule (ausente), sem escala (null) e rascunho", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) {
        return Promise.resolve({
          data: [
            { id: "i1", scheduled_date: "2026-02-01", celebration: { id: "c1", name: "Sem Campo" } },
            { id: "i2", scheduled_date: "2026-02-02", celebration: { id: "c1", name: "Nula" }, schedule: null },
            { id: "i3", scheduled_date: "2026-02-03", celebration: { id: "c1", name: "Rascunho" }, schedule: { id: "s1", status: "draft" } },
            { id: "i4", scheduled_date: "2026-02-04", celebration: { id: "c1", name: "Arquivada" }, schedule: { id: "s1", status: "archived" } },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Nenhuma celebração cadastrada.");
    await user.click(screen.getByRole("tab", { name: "Próximas" }));

    expect(await screen.findByText("Escala")).toBeInTheDocument();
    expect(screen.getByText("Sem escala")).toBeInTheDocument();
    expect(screen.getByText("Escala rascunho")).toBeInTheDocument();
    expect(screen.getByText("Escala arquivada")).toBeInTheDocument();
  });

  it("mostra estado vazio e trata falha na aba Próximas", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.reject(new Error("boom"));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Nenhuma celebração cadastrada.");
    await user.click(screen.getByRole("tab", { name: "Próximas" }));
    expect(
      await screen.findByText("Nenhuma instância próxima encontrada.")
    ).toBeInTheDocument();
  });

  it("trata resposta não-array de instâncias como lista vazia", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) return Promise.resolve({ data: { not: "array" } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Nenhuma celebração cadastrada.");
    await user.click(screen.getByRole("tab", { name: "Próximas" }));
    expect(
      await screen.findByText("Nenhuma instância próxima encontrada.")
    ).toBeInTheDocument();
  });

  it("abre a ordem de culto ao clicar numa instância e a escala ao clicar no badge", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url.startsWith("/celebrations/instances")) {
        return Promise.resolve({
          data: [{ id: "i1", scheduled_date: "2026-02-01", celebration: { id: "c1", name: "Culto" }, schedule: null }],
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<CelebracoesPage />);
    await screen.findByText("Nenhuma celebração cadastrada.");
    await user.click(screen.getByRole("tab", { name: "Próximas" }));
    await user.click(await screen.findByText("Culto"));
    expect(await screen.findByTestId("service-order-view")).toHaveTextContent("so:i1");

    await user.click(screen.getByText("Sem escala"));
    expect(await screen.findByTestId("schedule-sheet")).toHaveTextContent("schedule:i1");

    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular mudança" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
