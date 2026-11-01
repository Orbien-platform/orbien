import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addGuardian, updateGuardian, type KidsGuardian } from "@/lib/kids";
import { GuardianFormModal } from "./GuardianFormModal";

vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  addGuardian: vi.fn(),
  updateGuardian: vi.fn(),
}));

const G: KidsGuardian = {
  id: "g1",
  guardian_person_id: "p1",
  full_name: "Maria Souza",
  phone: "11999990000",
  photo_url: null,
  relationship: "mãe",
  can_pickup: true,
  is_primary: true,
};

function setup(guardian: KidsGuardian | null) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(<GuardianFormModal open onOpenChange={onOpenChange} childId="k1" guardian={guardian} onSaved={onSaved} />);
  return { onSaved, onOpenChange };
}

describe("GuardianFormModal", () => {
  beforeEach(() => {
    vi.mocked(addGuardian).mockReset();
    vi.mocked(updateGuardian).mockReset();
  });

  it("autoriza um terceiro: exige nome, telefone e parentesco", async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = setup(null);
    vi.mocked(addGuardian).mockResolvedValue();
    const save = screen.getByRole("button", { name: "Autorizar pessoa" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Nome"), "  Lúcia ");
    await user.type(screen.getByLabelText("Telefone"), "11988887777");
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Parentesco"), "avó");
    await user.click(screen.getByRole("checkbox", { name: /Pode buscar/ }));
    await user.click(save);

    await waitFor(() =>
      expect(addGuardian).toHaveBeenCalledWith("k1", {
        full_name: "Lúcia",
        phone: "11988887777",
        relationship: "avó",
        can_pickup: false,
        is_primary: false,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("edita só o vínculo: a pessoa não muda", async () => {
    const user = userEvent.setup();
    setup(G);
    vi.mocked(updateGuardian).mockResolvedValue();
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Parentesco")).toHaveValue("mãe");
    expect(screen.getByRole("checkbox", { name: /Responsável primário/ })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: /Pode buscar/ }));
    await user.click(screen.getByRole("button", { name: "Salvar responsável" }));
    await waitFor(() =>
      expect(updateGuardian).toHaveBeenCalledWith("g1", { relationship: "mãe", can_pickup: false, is_primary: true }),
    );
  });

  it("mostra a recusa do servidor (mínimo de um primário) e não fecha", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup(G);
    vi.mocked(updateGuardian).mockRejectedValue(
      Object.assign(new Error("x"), {
        isAxiosError: true,
        response: { status: 422, data: { message: "A criança precisa de ao menos um responsável primário" } },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar responsável" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ao menos um responsável primário");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("Voltar fecha sem gravar", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup(null);
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(addGuardian).not.toHaveBeenCalled();
  });
});
