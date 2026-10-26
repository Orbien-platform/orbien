import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deactivateRoom, listRooms, updateRoom, type KidsRoom } from "@/lib/kids";
import { RoomsPanel } from "./RoomsPanel";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
  default: {},
}));
vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  listRooms: vi.fn(),
  updateRoom: vi.fn(),
  deactivateRoom: vi.fn(),
}));
vi.mock("@/components/kids/RoomFormModal", () => ({
  RoomFormModal: ({ room, onSaved, onOpenChange }: { room: KidsRoom | null; onSaved: () => void; onOpenChange: (o: boolean) => void }) => (
    <div data-testid="room-form">
      form:{room ? room.name : "nova"}
      <button onClick={onSaved}>salvou</button>
      <button onClick={() => onOpenChange(false)}>fechou</button>
    </div>
  ),
}));

const room = (over: Partial<KidsRoom> = {}): KidsRoom => ({
  id: "r1",
  name: "Maternal",
  min_age_months: 24,
  max_age_months: 47,
  allows_out_of_range: false,
  capacity: 12,
  min_volunteers: 2,
  is_active: true,
  ...over,
});

const httpError = (status: number, message?: string) =>
  Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { message } } });

describe("RoomsPanel", () => {
  beforeEach(() => {
    vi.mocked(listRooms).mockReset();
    vi.mocked(updateRoom).mockReset();
    vi.mocked(deactivateRoom).mockReset();
  });

  it("lista as turmas com faixa em anos, aceite fora da faixa, capacidade e voluntários", async () => {
    vi.mocked(listRooms).mockResolvedValue([room(), room({ id: "r2", name: "Júnior", min_age_months: 72, max_age_months: 131, allows_out_of_range: true, capacity: null })]);
    render(<RoomsPanel canManage />);
    expect(await screen.findByText("Maternal")).toBeInTheDocument();
    expect(screen.getByText("2 a 3 anos")).toBeInTheDocument();
    expect(screen.getByText("6 a 10 anos")).toBeInTheDocument();
    expect(screen.getByText("Não aceita")).toBeInTheDocument();
    expect(screen.getByText("Confirma na hora")).toBeInTheDocument();
    expect(listRooms).toHaveBeenCalledWith(false);
  });

  it("estado vazio convida a cadastrar", async () => {
    vi.mocked(listRooms).mockResolvedValue([]);
    render(<RoomsPanel canManage />);
    expect(await screen.findByText("Nenhuma turma cadastrada")).toBeInTheDocument();
  });

  it("falha de carga é erro com nova tentativa, não lista vazia", async () => {
    const user = userEvent.setup();
    vi.mocked(listRooms).mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce([room()]);
    render(<RoomsPanel canManage />);
    expect(await screen.findByText("Não foi possível carregar as turmas.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma turma cadastrada")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(await screen.findByText("Maternal")).toBeInTheDocument();
  });

  it("403 diz que falta acesso, não que não há turmas", async () => {
    vi.mocked(listRooms).mockRejectedValue(httpError(403));
    render(<RoomsPanel canManage />);
    expect(await screen.findByText(/Você não tem acesso a Turmas/)).toBeInTheDocument();
  });

  it("quem não gerencia só lê: sem Nova turma nem ações", async () => {
    vi.mocked(listRooms).mockResolvedValue([room()]);
    render(<RoomsPanel canManage={false} />);
    await screen.findByText("Maternal");
    expect(screen.queryByRole("button", { name: "Nova turma" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar a turma/ })).not.toBeInTheDocument();
  });

  it("abre o formulário para criar e para editar, e recarrega ao salvar", async () => {
    const user = userEvent.setup();
    vi.mocked(listRooms).mockResolvedValue([room()]);
    render(<RoomsPanel canManage />);
    await screen.findByText("Maternal");

    await user.click(screen.getByRole("button", { name: "Nova turma" }));
    expect(screen.getByTestId("room-form")).toHaveTextContent("form:nova");
    await user.click(screen.getByRole("button", { name: "salvou" }));
    await waitFor(() => expect(listRooms).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "fechou" }));
    expect(screen.queryByTestId("room-form")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar a turma Maternal" }));
    expect(screen.getByTestId("room-form")).toHaveTextContent("form:Maternal");
  });

  it("desativa com confirmação e recarrega", async () => {
    const user = userEvent.setup();
    vi.mocked(listRooms).mockResolvedValue([room()]);
    vi.mocked(deactivateRoom).mockResolvedValue(room({ is_active: false }));
    render(<RoomsPanel canManage />);
    await screen.findByText("Maternal");

    await user.click(screen.getByRole("button", { name: "Desativar a turma Maternal" }));
    expect(screen.getByText("Desativar esta turma?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desativar turma" }));
    await waitFor(() => expect(deactivateRoom).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(listRooms).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Desativar esta turma?")).not.toBeInTheDocument();
  });

  it("falha ao desativar fica no diálogo; Voltar fecha", async () => {
    const user = userEvent.setup();
    vi.mocked(listRooms).mockResolvedValue([room()]);
    vi.mocked(deactivateRoom).mockRejectedValue(httpError(422, "Turma com check-in aberto"));
    render(<RoomsPanel canManage />);
    await screen.findByText("Maternal");
    await user.click(screen.getByRole("button", { name: "Desativar a turma Maternal" }));
    await user.click(screen.getByRole("button", { name: "Desativar turma" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Turma com check-in aberto");
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByText("Desativar esta turma?")).not.toBeInTheDocument();
  });

  it("mostra desativadas sob pedido e reativa", async () => {
    const user = userEvent.setup();
    vi.mocked(listRooms).mockResolvedValue([room({ is_active: false })]);
    vi.mocked(updateRoom).mockResolvedValue(room());
    render(<RoomsPanel canManage />);
    await screen.findByText("Maternal");
    await user.click(screen.getByRole("checkbox", { name: "Mostrar desativadas" }));
    await waitFor(() => expect(listRooms).toHaveBeenLastCalledWith(true));
    expect(await screen.findByText("Desativada")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reativar a turma Maternal" }));
    await waitFor(() => expect(updateRoom).toHaveBeenCalledWith("r1", { is_active: true }));
  });

  it("falha ao reativar avisa fora do diálogo", async () => {
    const user = userEvent.setup();
    vi.mocked(listRooms).mockResolvedValue([room({ is_active: false })]);
    vi.mocked(updateRoom).mockRejectedValue(httpError(400, "Não pode reativar"));
    render(<RoomsPanel canManage />);
    await screen.findByText("Maternal");
    await user.click(screen.getByRole("button", { name: "Reativar a turma Maternal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não pode reativar");
  });
});
