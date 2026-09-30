import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScheduleSuggestions } from "./ScheduleSuggestions";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const SUGGEST_URL = "/celebrations/instances/i1/schedule/suggest";
const ASSIGN_URL = "/celebrations/instances/i1/schedule/ministries/cm1/assignments";

function row(over: object = {}) {
  return {
    celebration_ministry_id: "cm1",
    slots_remaining: 2,
    eligible_count: 12,
    suggestions: [
      { volunteer_profile_id: "vp1", person_id: "p1", full_name: "Ana Souza", times_served: 0, last_served_at: null },
      { volunteer_profile_id: "vp2", person_id: "p2", full_name: "Bruno Lima", times_served: 3, last_served_at: "2026-08-02T12:00:00.000Z" },
    ],
    ...over,
  };
}

function renderIt(onApplied = vi.fn()) {
  render(<ScheduleSuggestions instanceId="i1" celebrationMinistryId="cm1" onApplied={onApplied} />);
  return onApplied;
}

describe("ScheduleSuggestions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mostra a lista em ordem, o motivo do rodízio e 'N de eligible_count'", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [row({ celebration_ministry_id: "outro" }), row()] });
    renderIt();
    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Nunca serviu nesta função")).toBeInTheDocument();
    expect(screen.getByText(/Serviu 3 vezes · última em 02\/08\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/2 de 12 disponíveis/)).toBeInTheDocument();
    expect(screen.getByText(/faltam 2 vagas/)).toBeInTheDocument();
    expect(screen.getByText(/Mostrando as 2 primeiras/)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Ana Souza");
    expect(items[1]).toHaveTextContent("Bruno Lima");
  });

  it("mostra estado vazio quando ninguém é elegível", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [row({ eligible_count: 0, suggestions: [] })] });
    renderIt();
    expect(await screen.findByText(/Ninguém disponível para esta função/)).toBeInTheDocument();
  });

  it("mostra erro e permite tentar de novo", async () => {
    vi.mocked(api.get).mockRejectedValueOnce({ isAxiosError: true, response: { status: 500 } });
    vi.mocked(api.get).mockResolvedValueOnce({ data: [row()] });
    renderIt();
    expect(await screen.findByText("Não foi possível carregar as sugestões.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
  });

  it("um clique aplica só aquela pessoa, via POST de assignments, e recarrega", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [row()] });
    vi.mocked(api.post).mockResolvedValue({ data: { overbooked: true } });
    const onApplied = renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Escalar Bruno Lima" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith({ overbooked: true }));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(ASSIGN_URL, { volunteer_profile_id: "vp2" });
    expect(vi.mocked(api.get).mock.calls.filter(([u]) => u === SUGGEST_URL)).toHaveLength(2);
  });

  it("não aplica nada sozinho ao abrir", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [row()] });
    renderIt();
    await screen.findByText("Ana Souza");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("conflito (409) avisa, recarrega a lista e atualiza a escala", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [row()] });
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "Voluntário já atribuído a este slot" } },
    });
    const onApplied = renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Escalar Ana Souza" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ana Souza já está nesta função. A lista foi atualizada.");
    expect(onApplied).toHaveBeenCalledWith({});
    expect(vi.mocked(api.get).mock.calls.filter(([u]) => u === SUGGEST_URL)).toHaveLength(2);
  });

  it("outro erro ao aplicar mostra a mensagem da API sem recarregar", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [row()] });
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: "Voluntário não pertence a este ministério" } },
    });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Escalar Ana Souza" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Voluntário não pertence a este ministério");
  });
});
