import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoom, updateRoom, type KidsRoom } from "@/lib/kids";
import { RoomFormModal } from "./RoomFormModal";

vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  createRoom: vi.fn(),
  updateRoom: vi.fn(),
}));

const ROOM: KidsRoom = {
  id: "r1",
  name: "Maternal",
  min_age_months: 24,
  max_age_months: 47,
  allows_out_of_range: true,
  capacity: 12,
  min_volunteers: 2,
  is_active: true,
};

function setup(room: KidsRoom | null = null) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(<RoomFormModal open onOpenChange={onOpenChange} room={room} onSaved={onSaved} />);
  return { onSaved, onOpenChange };
}

describe("RoomFormModal", () => {
  beforeEach(() => {
    vi.mocked(createRoom).mockReset();
    vi.mocked(updateRoom).mockReset();
  });

  it("exige nome e faixa etária: sem eles não dá para criar (KIDS-01 AC 2)", async () => {
    const user = userEvent.setup();
    setup();
    const save = screen.getByRole("button", { name: "Criar turma" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Nome da turma"), "Júnior");
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("De (anos)"), "6");
    await user.type(screen.getByLabelText("Até (anos)"), "5");
    expect(save).toBeDisabled();
    expect(screen.getByText(/início menor ou igual ao fim/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Até (anos)"));
    await user.type(screen.getByLabelText("Até (anos)"), "8");
    expect(save).toBeEnabled();
  });

  it("converte anos em meses: “até 5” inclui 5 anos e 11 meses", async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = setup();
    vi.mocked(createRoom).mockResolvedValue(ROOM);

    await user.type(screen.getByLabelText("Nome da turma"), "  Júnior ");
    await user.type(screen.getByLabelText("De (anos)"), "2");
    await user.type(screen.getByLabelText("Até (anos)"), "5");
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    await waitFor(() => expect(createRoom).toHaveBeenCalled());
    expect(createRoom).toHaveBeenCalledWith({
      name: "Júnior",
      min_age_months: 24,
      max_age_months: 71,
      allows_out_of_range: false,
      capacity: null,
      min_volunteers: 0,
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("em meses, manda os valores como estão, com capacidade e aceite fora da faixa", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(createRoom).mockResolvedValue(ROOM);

    await user.type(screen.getByLabelText("Nome da turma"), "Berçário");
    await user.click(screen.getByRole("radio", { name: "Em meses" }));
    await user.type(screen.getByLabelText("De (meses)"), "0");
    await user.type(screen.getByLabelText("Até (meses)"), "17");
    await user.click(screen.getByRole("checkbox", { name: /Aceita criança fora da faixa/ }));
    await user.type(screen.getByLabelText("Capacidade"), "8");
    await user.clear(screen.getByLabelText("Voluntários no mínimo"));
    await user.type(screen.getByLabelText("Voluntários no mínimo"), "3");
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({
        name: "Berçário",
        min_age_months: 0,
        max_age_months: 17,
        allows_out_of_range: true,
        capacity: 8,
        min_volunteers: 3,
      }),
    );
  });

  it("recusa capacidade zero ou que não é número", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("Nome da turma"), "X");
    await user.type(screen.getByLabelText("De (anos)"), "1");
    await user.type(screen.getByLabelText("Até (anos)"), "2");
    await user.type(screen.getByLabelText("Capacidade"), "0");
    expect(screen.getByRole("button", { name: "Criar turma" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Capacidade"));
    await user.type(screen.getByLabelText("Capacidade"), "abc");
    expect(screen.getByRole("button", { name: "Criar turma" })).toBeDisabled();
  });

  it("edita uma turma em anos cheios e mostra a faixa na unidade da igreja", async () => {
    const user = userEvent.setup();
    const { onSaved } = setup(ROOM);
    vi.mocked(updateRoom).mockResolvedValue(ROOM);

    expect(screen.getByLabelText("De (anos)")).toHaveValue("2");
    expect(screen.getByLabelText("Até (anos)")).toHaveValue("3");
    expect(screen.getByLabelText("Capacidade")).toHaveValue("12");
    expect(screen.getByRole("checkbox", { name: /Aceita criança fora da faixa/ })).toBeChecked();

    await user.clear(screen.getByLabelText("Nome da turma"));
    await user.type(screen.getByLabelText("Nome da turma"), "Maternal 2");
    await user.click(screen.getByRole("button", { name: "Salvar turma" }));

    await waitFor(() => expect(updateRoom).toHaveBeenCalled());
    expect(updateRoom).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ name: "Maternal 2", min_age_months: 24, max_age_months: 47, capacity: 12 }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("abre em meses quando a faixa não fecha em anos cheios, e sem limite quando não há capacidade", () => {
    setup({ ...ROOM, min_age_months: 6, max_age_months: 20, capacity: null });
    expect(screen.getByLabelText("De (meses)")).toHaveValue("6");
    expect(screen.getByLabelText("Até (meses)")).toHaveValue("20");
    expect(screen.getByLabelText("Capacidade")).toHaveValue("");
  });

  it("mostra o erro do servidor e não fecha", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup(ROOM);
    vi.mocked(updateRoom).mockRejectedValue(
      Object.assign(new Error("x"), {
        isAxiosError: true,
        response: { status: 400, data: { message: "A faixa etária é inválida" } },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar turma" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A faixa etária é inválida");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("volta sem salvar", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createRoom).not.toHaveBeenCalled();
  });
});
