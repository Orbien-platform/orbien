import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelSession, listRooms, listSessions, openSessions, type KidsRoom, type KidsSession } from "@/lib/kids";
import { KidsSessionsModal } from "./KidsSessionsModal";

vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  listSessions: vi.fn(),
  listRooms: vi.fn(),
  openSessions: vi.fn(),
  cancelSession: vi.fn(),
}));

const room = (id: string, name: string, over: Partial<KidsRoom> = {}): KidsRoom => ({
  id,
  name,
  min_age_months: 24,
  max_age_months: 47,
  allows_out_of_range: false,
  capacity: null,
  min_volunteers: 0,
  is_active: true,
  ...over,
});

const session = (id: string, r: KidsRoom, over: Partial<KidsSession> = {}): KidsSession => ({
  id,
  status: "open",
  celebration_instance_id: "i1",
  room_id: r.id,
  room: r,
  volunteers_scheduled: 0,
  volunteers_missing: 0,
  ...over,
});

const httpError = (status: number, message: string) =>
  Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { message } } });

function setup() {
  render(<KidsSessionsModal open onOpenChange={vi.fn()} instanceId="i1" subtitle="dom., 25/10/2026" />);
}

describe("KidsSessionsModal", () => {
  beforeEach(() => {
    vi.mocked(listSessions).mockReset();
    vi.mocked(listRooms).mockReset();
    vi.mocked(openSessions).mockReset();
    vi.mocked(cancelSession).mockReset();
  });

  it("culto sem sessão é estado normal e convida a abrir turmas", async () => {
    vi.mocked(listSessions).mockResolvedValue([]);
    vi.mocked(listRooms).mockResolvedValue([room("r1", "Maternal")]);
    setup();
    expect(await screen.findByText(/Este culto não tem turma kids/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("abre várias turmas de uma vez e recarrega", async () => {
    const user = userEvent.setup();
    const m = room("r1", "Maternal");
    const j = room("r2", "Júnior", { min_age_months: 72, max_age_months: 131 });
    vi.mocked(listSessions).mockResolvedValueOnce([]).mockResolvedValueOnce([session("s1", m), session("s2", j)]);
    vi.mocked(listRooms).mockResolvedValue([m, j]);
    vi.mocked(openSessions).mockResolvedValue();
    setup();

    const open = await screen.findByRole("button", { name: "Abrir turmas" });
    expect(open).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Maternal/ }));
    await user.click(screen.getByRole("checkbox", { name: /Júnior/ }));
    await user.click(screen.getByRole("checkbox", { name: /Júnior/ }));
    await user.click(open);

    await waitFor(() => expect(openSessions).toHaveBeenCalledWith("i1", ["r1"]));
    expect(await screen.findByText("Todas as turmas ativas já foram abertas neste culto.")).toBeInTheDocument();
  });

  it("mostra a falta de voluntários (volunteers_missing), escala completa e sessão cancelada", async () => {
    const m = room("r1", "Maternal", { min_volunteers: 3 });
    const j = room("r2", "Júnior", { min_volunteers: 2 });
    const b = room("r3", "Berçário", { min_volunteers: 1 });
    const x = room("r4", "Teens");
    vi.mocked(listSessions).mockResolvedValue([
      session("s1", m, { volunteers_missing: 2 }),
      session("s2", j, { volunteers_missing: 0, volunteers_scheduled: 2 }),
      session("s3", b, { volunteers_missing: 1 }),
      session("s4", x, { status: "cancelled" }),
    ]);
    vi.mocked(listRooms).mockResolvedValue([m, j, b, x]);
    setup();
    expect(await screen.findByText("Faltam 2 voluntários")).toBeInTheDocument();
    expect(screen.getByText("Falta 1 voluntário")).toBeInTheDocument();
    expect(screen.getByText("Escala completa")).toBeInTheDocument();
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar a sessão Teens" })).not.toBeInTheDocument();
  });

  it("cancela uma sessão; o erro do servidor aparece (check-in aberto)", async () => {
    const user = userEvent.setup();
    const m = room("r1", "Maternal");
    vi.mocked(listSessions).mockResolvedValue([session("s1", m)]);
    vi.mocked(listRooms).mockResolvedValue([m]);
    vi.mocked(cancelSession).mockRejectedValueOnce(httpError(422, "Há criança presente nesta sessão")).mockResolvedValueOnce();
    setup();
    await user.click(await screen.findByRole("button", { name: "Cancelar a sessão Maternal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Há criança presente nesta sessão");

    await user.click(screen.getByRole("button", { name: "Cancelar a sessão Maternal" }));
    await waitFor(() => expect(cancelSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("sem turma cadastrada, manda cadastrar", async () => {
    vi.mocked(listSessions).mockResolvedValue([]);
    vi.mocked(listRooms).mockResolvedValue([]);
    setup();
    expect(await screen.findByText(/Não há turma cadastrada/)).toBeInTheDocument();
  });

  it("falha de carga é erro com nova tentativa", async () => {
    const user = userEvent.setup();
    vi.mocked(listSessions).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce([]);
    vi.mocked(listRooms).mockResolvedValue([]);
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as turmas deste culto");
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText(/Este culto não tem turma kids/)).toBeInTheDocument();
  });
});
