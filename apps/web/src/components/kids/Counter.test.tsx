import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listInstancesOn, listSessions, type KidsInstance, type KidsSession } from "@/lib/kids";
import { Counter } from "./Counter";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
  default: {},
}));
vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  listInstancesOn: vi.fn(),
  listSessions: vi.fn(),
}));
vi.mock("@/components/kids/SessionDesk", () => ({
  SessionDesk: ({ sessionId, canOverride }: { sessionId: string; canOverride: boolean }) => (
    <div data-testid="desk">
      desk:{sessionId}:{String(canOverride)}
    </div>
  ),
}));

const instance = (id: string, name: string, time: string, status = "scheduled"): KidsInstance => ({
  id,
  scheduled_date: "2026-10-26T00:00:00.000Z",
  status,
  celebration: { id: `c-${id}`, name, start_time: time },
});
const session = (id: string, roomName: string, minAge: number, over: Partial<KidsSession> = {}): KidsSession => ({
  id,
  status: "open",
  celebration_instance_id: "i1",
  room_id: `r-${id}`,
  room: {
    id: `r-${id}`,
    name: roomName,
    min_age_months: minAge,
    max_age_months: minAge + 23,
    allows_out_of_range: false,
    capacity: null,
    min_volunteers: 0,
    is_active: true,
  },
  volunteers_scheduled: 0,
  volunteers_missing: 0,
  ...over,
});
const httpError = (status: number) => Object.assign(new Error("x"), { isAxiosError: true, response: { status } });

describe("Counter (balcão)", () => {
  beforeEach(() => {
    vi.mocked(listInstancesOn).mockReset();
    vi.mocked(listSessions).mockReset();
  });

  it("dia sem culto, ou culto sem turma kids, é estado vazio que diz como abrir", async () => {
    vi.mocked(listInstancesOn).mockResolvedValue([instance("i1", "Culto", "10:00")]);
    vi.mocked(listSessions).mockResolvedValue([]);
    render(<Counter canManage />);
    expect(await screen.findByText("Nenhuma turma kids aberta hoje")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Celebrações" })).toHaveAttribute("href", "/celebracoes");
  });

  it("junta as turmas abertas dos cultos de hoje, ordenadas por horário e idade, e abre a primeira", async () => {
    vi.mocked(listInstancesOn).mockResolvedValue([instance("i2", "Culto da noite", "19:00"), instance("i1", "Culto da manhã", "10:00")]);
    vi.mocked(listSessions).mockImplementation(async (id) =>
      id === "i1"
        ? [session("s-j", "Júnior", 72), session("s-m", "Maternal", 24), session("s-x", "Teens", 144, { status: "cancelled" })]
        : [session("s-n", "Maternal", 24)],
    );
    render(<Counter canManage />);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "MaternalCulto da manhã · 10:00",
      "JúniorCulto da manhã · 10:00",
      "MaternalCulto da noite · 19:00",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("desk")).toHaveTextContent("desk:s-m:true");
  });

  it("culto cancelado não entra; troca de turma troca a mesa", async () => {
    const user = userEvent.setup();
    vi.mocked(listInstancesOn).mockResolvedValue([instance("i1", "Culto", "10:00"), instance("i9", "Cancelado", "11:00", "cancelled")]);
    vi.mocked(listSessions).mockResolvedValue([session("s-m", "Maternal", 24), session("s-j", "Júnior", 72)]);
    render(<Counter canManage={false} />);
    await user.click(await screen.findByRole("tab", { name: /Júnior/ }));
    expect(screen.getByTestId("desk")).toHaveTextContent("desk:s-j:false");
    expect(listSessions).toHaveBeenCalledTimes(1);
    expect(listSessions).toHaveBeenCalledWith("i1");
  });

  it("avisa na aba a falta de voluntários", async () => {
    vi.mocked(listInstancesOn).mockResolvedValue([instance("i1", "Culto", "10:00")]);
    vi.mocked(listSessions).mockResolvedValue([
      session("s-m", "Maternal", 24, { volunteers_missing: 1 }),
      session("s-j", "Júnior", 72, { volunteers_missing: 3 }),
    ]);
    render(<Counter canManage />);
    expect(await screen.findByText("Falta 1 voluntário")).toBeInTheDocument();
    expect(screen.getByText("Faltam 3 voluntários")).toBeInTheDocument();
  });

  it("falha de carga é erro com nova tentativa, não ‘nenhuma turma’", async () => {
    const user = userEvent.setup();
    vi.mocked(listInstancesOn).mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce([instance("i1", "Culto", "10:00")]);
    vi.mocked(listSessions).mockResolvedValue([session("s-m", "Maternal", 24)]);
    render(<Counter canManage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as turmas de hoje.");
    expect(screen.queryByText("Nenhuma turma kids aberta hoje")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByTestId("desk")).toBeInTheDocument();
  });

  it("falha parcial: mostra as turmas dos cultos que carregaram e avisa dos que falharam, com nova tentativa", async () => {
    const user = userEvent.setup();
    vi.mocked(listInstancesOn).mockResolvedValue([instance("i1", "Culto da manhã", "10:00"), instance("i2", "Culto da noite", "19:00")]);
    vi.mocked(listSessions).mockImplementation(async (id) => {
      if (id === "i2") throw httpError(500);
      return [session("s-m", "Maternal", 24)];
    });
    render(<Counter canManage />);
    expect(await screen.findAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("As turmas de Culto da noite · 19:00 não carregaram.");
    expect(screen.queryByText("Nenhuma turma kids aberta hoje")).not.toBeInTheDocument();

    vi.mocked(listSessions).mockImplementation(async (id) => [session(`s-${id}`, id === "i1" ? "Maternal" : "Júnior", id === "i1" ? 24 : 72)]);
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falha parcial sem nenhuma turma aberta nos cultos que carregaram não vira estado vazio silencioso", async () => {
    vi.mocked(listInstancesOn).mockResolvedValue([instance("i1", "Culto da manhã", "10:00"), instance("i2", "Culto da noite", "19:00")]);
    vi.mocked(listSessions).mockImplementation(async (id) => {
      if (id === "i2") throw httpError(500);
      return [];
    });
    render(<Counter canManage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("As turmas de Culto da noite · 19:00 não carregaram.");
    expect(screen.queryByText("Nenhuma turma kids aberta hoje")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });

  it("falha parcial em vários cultos nomeia a quantidade", async () => {
    vi.mocked(listInstancesOn).mockResolvedValue([
      instance("i1", "Culto A", "08:00"),
      instance("i2", "Culto B", "10:00"),
      instance("i3", "Culto C", "19:00"),
    ]);
    vi.mocked(listSessions).mockImplementation(async (id) => {
      if (id !== "i1") throw httpError(500);
      return [session("s-m", "Maternal", 24)];
    });
    render(<Counter canManage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("As turmas de 2 cultos não carregaram: Culto B · 10:00, Culto C · 19:00.");
  });

  it("falha total das turmas é erro de carga com nova tentativa, não estado vazio", async () => {
    vi.mocked(listInstancesOn).mockResolvedValue([instance("i1", "Culto A", "08:00"), instance("i2", "Culto B", "10:00")]);
    vi.mocked(listSessions).mockRejectedValue(httpError(500));
    render(<Counter canManage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as turmas de hoje.");
    expect(screen.queryByText("Nenhuma turma kids aberta hoje")).not.toBeInTheDocument();
  });

  it("403 em todas as turmas diz que falta acesso", async () => {
    vi.mocked(listInstancesOn).mockResolvedValue([instance("i1", "Culto A", "08:00")]);
    vi.mocked(listSessions).mockRejectedValue(httpError(403));
    render(<Counter canManage />);
    expect(await screen.findByText(/Você não tem acesso/)).toBeInTheDocument();
  });

  it("403 diz que falta acesso ao balcão", async () => {
    vi.mocked(listInstancesOn).mockRejectedValue(httpError(403));
    render(<Counter canManage />);
    expect(await screen.findByText(/Você não tem acesso a o balcão do Kids|Você não tem acesso a/)).toBeInTheDocument();
  });

  it("mostra o carregamento enquanto busca", () => {
    vi.mocked(listInstancesOn).mockReturnValue(new Promise(() => {}));
    render(<Counter canManage />);
    expect(screen.getByRole("status", { name: "Carregando o balcão" })).toBeInTheDocument();
  });
});
