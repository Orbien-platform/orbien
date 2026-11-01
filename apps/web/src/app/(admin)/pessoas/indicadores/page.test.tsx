import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import IndicadoresPage from "./page";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
  default: { get: vi.fn(), put: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
// O cartão do Kids tem teste próprio; aqui só interessa onde e com que período entra.
vi.mock("@/components/kids/KidsAttendanceCard", () => ({
  KidsAttendanceCard: ({ start, end }: { start: string; end: string }) => (
    <div data-testid="kids-card">
      {start}|{end}
    </div>
  ),
}));

const mockedApi = vi.mocked(api, true);
const mockedUseAuth = vi.mocked(useAuth);

function setup(roles = ["pastor"], extra: Record<string, unknown> = {}) {
  mockedUseAuth.mockReturnValue({
    user: {
      id: "u1", name: "Ana", email: "a@a.com", roles, tenant_id: "t1", congregation_id: "g1",
      support_session: false, support_tenant_name: null, areas: null,
      expires_at: Math.floor(Date.now() / 1000) + 300, ...extra,
    },
  } as never);
}

const summary = {
  services_counted: 3,
  totals: { children: 15, members: 121, attendees: 17, visitors: 5, total: 158 },
  average: { children: 5, members: 40.3, attendees: 5.7, visitors: 1.7, total: 52.7 },
};
const rows = [
  {
    celebration_instance_id: "i2", scheduled_date: "2026-10-18T00:00:00.000Z",
    celebration: { id: "c1", name: "Culto Domingo", start_time: "19:00" },
    attendance: { children: 5, members: 41, attendees: 7, visitors: 1, total: 54 },
  },
  {
    celebration_instance_id: "i1", scheduled_date: "2026-10-11T00:00:00.000Z",
    celebration: { id: "c1", name: "Culto Domingo", start_time: "19:00" },
    attendance: null,
  },
];

function mockOk() {
  mockedApi.get.mockImplementation((url: string) => {
    if (url === "/celebrations") return Promise.resolve({ data: [{ id: "c1", name: "Culto Domingo" }] });
    if (url === "/celebrations/attendance/summary") return Promise.resolve({ data: summary });
    if (url === "/celebrations/attendance") return Promise.resolve({ data: rows });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

describe("Indicadores de presença", () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.put.mockReset();
  });

  it("mostra a média de cada categoria e o total acumulado", async () => {
    setup();
    mockOk();
    render(<IndicadoresPage />);

    expect(await screen.findByText("52,7")).toBeInTheDocument();
    expect(screen.getByText("40,3")).toBeInTheDocument();
    expect(screen.getByText("5,7")).toBeInTheDocument();
    expect(screen.getByText(/3 cultos contados/)).toBeInTheDocument();
    expect(screen.getByText(/158 pessoas: 15 crianças, 121 membros, 17 frequentadores e 5 visitantes/)).toBeInTheDocument();
    // Culto passado sem lançamento é dito, não zerado.
    expect(screen.getByText("Sem contagem")).toBeInTheDocument();
  });

  it("pede ao servidor o período e a celebração escolhidos", async () => {
    setup();
    mockOk();
    const user = userEvent.setup();
    render(<IndicadoresPage />);
    await screen.findByText("52,7");

    await user.selectOptions(screen.getByLabelText("Celebração"), "c1");

    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenCalledWith(
        "/celebrations/attendance/summary",
        { params: expect.objectContaining({ celebration_id: "c1", date_from: expect.any(String), date_to: expect.any(String) }) },
      ),
    );
  });

  it("sem contagem no período, mostra estado vazio em vez de zero", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/celebrations") return Promise.resolve({ data: null });
      if (url === "/celebrations/attendance/summary")
        return Promise.resolve({
          data: { services_counted: 0, totals: { children: 0, members: 0, attendees: 0, visitors: 0, total: 0 }, average: { children: 0, members: 0, attendees: 0, visitors: 0, total: 0 } },
        });
      return Promise.resolve({ data: null });
    });
    render(<IndicadoresPage />);

    expect(await screen.findByText("Nenhuma contagem neste período")).toBeInTheDocument();
  });

  it("papel sem leitura (403) vê a tela de sem acesso", async () => {
    setup(["member"]);
    mockedApi.get.mockImplementation((url: string) =>
      url === "/celebrations" ? Promise.resolve({ data: [] }) : Promise.reject({ response: { status: 403 } }),
    );
    render(<IndicadoresPage />);
    expect(await screen.findByText("Você não tem acesso a Indicadores.")).toBeInTheDocument();
  });

  it("erro de rede oferece tentar de novo", async () => {
    setup();
    let fail = true;
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/celebrations") return Promise.reject(new Error("rede"));
      if (fail) return Promise.reject(new Error("rede"));
      return Promise.resolve({ data: url.endsWith("summary") ? summary : rows });
    });
    const user = userEvent.setup();
    render(<IndicadoresPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar a presença.");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("52,7")).toBeInTheDocument();
  });

  it("a liderança corrige a contagem de um culto pela linha da tabela", async () => {
    setup(["pastor"]);
    mockOk();
    mockedApi.put.mockResolvedValue({ data: { children: 1, members: 1, attendees: 1, visitors: 1, total: 4 } });
    const user = userEvent.setup();
    render(<IndicadoresPage />);
    await screen.findByText("Sem contagem");

    await user.click(screen.getByText("Sem contagem"));
    await user.type(await screen.findByLabelText("Crianças"), "1");
    await user.type(screen.getByLabelText("Membros"), "1");
    await user.type(screen.getByLabelText("Frequentadores"), "1");
    await user.type(screen.getByLabelText("Visitantes"), "1");
    await user.click(screen.getByRole("button", { name: "Salvar contagem" }));

    await waitFor(() =>
      expect(mockedApi.put).toHaveBeenCalledWith("/celebrations/instances/i1/attendance", {
        children: 1, members: 1, attendees: 1, visitors: 1,
      }),
    );
    // Recarrega o resumo depois de salvar.
    await waitFor(() =>
      expect(mockedApi.get.mock.calls.filter(([u]) => u === "/celebrations/attendance/summary").length).toBeGreaterThan(1),
    );
  });

  it("a contagem sem lançamento abre com o total de check-in do Kids como valor inicial, editável", async () => {
    setup(["pastor"]);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url === "/celebrations/attendance/summary") return Promise.resolve({ data: summary });
      return Promise.resolve({ data: [{ ...rows[1], checkin_total: 7 }] });
    });
    const user = userEvent.setup();
    render(<IndicadoresPage />);
    await user.click(await screen.findByText("Sem contagem"));
    expect(await screen.findByLabelText("Crianças")).toHaveValue("7");
    expect(screen.getByText("Check-in do Kids: 7 crianças")).toBeInTheDocument();
  });

  it("o cartão do Kids recebe o período e fica na tela mesmo sem contagem de público", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url === "/celebrations/attendance/summary")
        return Promise.resolve({ data: { ...summary, services_counted: 0 } });
      return Promise.resolve({ data: [] });
    });
    render(<IndicadoresPage />);
    expect(await screen.findByText("Nenhuma contagem neste período")).toBeInTheDocument();
    expect(screen.getByTestId("kids-card").textContent).toMatch(/^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/);
  });

  it("intervalo inválido não mostra o cartão do Kids", async () => {
    setup();
    mockOk();
    const user = userEvent.setup();
    render(<IndicadoresPage />);
    await screen.findByText("52,7");
    await user.click(screen.getByRole("button", { name: "Personalizado" }));
    await user.clear(document.querySelectorAll('input[type="date"]')[0] as HTMLInputElement);
    await screen.findByText(/Informe a data inicial e a final/);
    expect(screen.queryByTestId("kids-card")).not.toBeInTheDocument();
  });

  it("quem só lê (ministry_leader) não abre o formulário pela linha", async () => {
    setup(["ministry_leader"]);
    mockOk();
    const user = userEvent.setup();
    render(<IndicadoresPage />);
    await user.click(await screen.findByText("Sem contagem"));
    expect(screen.queryByLabelText("Crianças")).not.toBeInTheDocument();
  });

  it("igreja Starter vê o convite Premium e não pede nada à API", () => {
    setup(["pastor"], { areas: ["persons"], upgrade_areas: ["celebrations"] });
    render(<IndicadoresPage />);
    expect(screen.getByText("Disponível no plano Premium")).toBeInTheDocument();
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("intervalo livre inválido pede as duas datas e não consulta", async () => {
    setup();
    mockOk();
    const user = userEvent.setup();
    render(<IndicadoresPage />);
    await screen.findByText("52,7");
    await user.click(screen.getByRole("button", { name: "Personalizado" }));
    const inputs = document.querySelectorAll('input[type="date"]');
    await user.clear(inputs[0] as HTMLInputElement);
    expect(await screen.findByText(/Informe a data inicial e a final/)).toBeInTheDocument();
  });

  it("usa o singular com um culto contado e aceita sessão sem lista de papéis", async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: "u1", name: "Ana", email: "a@a.com", tenant_id: "t1", congregation_id: "g1", areas: null },
    } as never);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/persons/demographics") return Promise.reject({ response: { status: 403 } });
      if (url === "/celebrations") return Promise.resolve({ data: [] });
      if (url === "/celebrations/attendance/summary")
        return Promise.resolve({ data: { ...summary, services_counted: 1 } });
      return Promise.resolve({ data: rows });
    });
    render(<IndicadoresPage />);
    expect(await screen.findByText(/1 culto contado/)).toBeInTheDocument();
  });

  it("descarta a resposta de um filtro antigo (sucesso, falha) e a de uma tela já desmontada", async () => {
    setup();
    const pending: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void; url: string }> = [];
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/persons/demographics") return Promise.reject({ response: { status: 403 } });
      if (url === "/celebrations") return Promise.resolve({ data: [{ id: "c1", name: "Culto Domingo" }] });
      return new Promise((resolve, reject) => pending.push({ resolve, reject, url }));
    });
    const user = userEvent.setup();
    const { unmount } = render(<IndicadoresPage />);
    await waitFor(() => expect(pending).toHaveLength(2));

    // Troca o filtro antes de a primeira busca voltar: a primeira vira obsoleta.
    await user.selectOptions(screen.getByLabelText("Celebração"), "c1");
    await waitFor(() => expect(pending).toHaveLength(4));
    pending[0].reject(new Error("rede antiga"));
    pending[1].resolve({ data: rows });
    // A busca atual falha: só ela vale.
    pending[2].reject(new Error("rede"));
    pending[3].reject(new Error("rede"));
    await screen.findByRole("alert");

    // Desmontar com busca em voo não deve atualizar nada.
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(pending).toHaveLength(6));
    unmount();
    pending[4].resolve({ data: summary });
    pending[5].resolve({ data: rows });
  });

  it("descarta a resposta bem-sucedida de um filtro antigo", async () => {
    setup();
    const pending: Array<(v: unknown) => void> = [];
    mockedApi.get.mockImplementation((url: string) => {
      if (url === "/persons/demographics") return Promise.reject({ response: { status: 403 } });
      if (url === "/celebrations") return Promise.resolve({ data: [{ id: "c1", name: "Culto Domingo" }] });
      return new Promise((resolve) => pending.push(resolve));
    });
    const user = userEvent.setup();
    render(<IndicadoresPage />);
    await waitFor(() => expect(pending).toHaveLength(2));
    await user.selectOptions(screen.getByLabelText("Celebração"), "c1");
    await waitFor(() => expect(pending).toHaveLength(4));

    // A antiga volta com 3 cultos; a atual, com 1: só a atual aparece.
    pending[0]({ data: summary });
    pending[1]({ data: rows });
    pending[2]({ data: { ...summary, services_counted: 1 } });
    pending[3]({ data: rows });
    expect(await screen.findByText(/1 culto contado/)).toBeInTheDocument();
    expect(screen.queryByText(/3 cultos contados/)).not.toBeInTheDocument();
  });
});
