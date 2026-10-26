import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkOut, checkOutOverride, getChild, type KidsFicha, type KidsRosterItem } from "@/lib/kids";
import { CheckoutDialog, REFUSAL } from "./CheckoutDialog";

vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  checkOut: vi.fn(),
  checkOutOverride: vi.fn(),
  getChild: vi.fn(),
}));

const ITEM: KidsRosterItem = {
  checkin_id: "c1",
  checked_in_at: "2026-10-25T13:00:00.000Z",
  age_override: false,
  child: { id: "k1", full_name: "Davi Souza", birth_date: "2022-03-10T00:00:00.000Z" },
  guardian: { person_id: "p1", full_name: "Maria Souza" },
  has_allergy: true,
  allergies: "amendoim",
};
const FICHA: KidsFicha = {
  id: "k1",
  full_name: "Davi Souza",
  birth_date: null,
  household_id: null,
  allergies: "amendoim",
  medical_notes: null,
  guardians: [
    { id: "g1", guardian_person_id: "p1", full_name: "Maria Souza", phone: null, photo_url: null, relationship: "mãe", can_pickup: true, is_primary: true },
    { id: "g2", guardian_person_id: "p2", full_name: "Lúcia Souza", phone: null, photo_url: null, relationship: "avó", can_pickup: false, is_primary: false },
  ],
};
const apiError = (status: number, message?: string) =>
  Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { message } } });

function setup(canOverride = true) {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(<CheckoutDialog item={ITEM} canOverride={canOverride} onClose={onClose} onDone={onDone} />);
  return { onClose, onDone };
}

async function fillCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.type(await screen.findByLabelText("Código de retirada"), code);
}

describe("CheckoutDialog", () => {
  beforeEach(() => {
    vi.mocked(checkOut).mockReset();
    vi.mocked(checkOutOverride).mockReset();
    vi.mocked(getChild).mockReset();
    vi.mocked(getChild).mockResolvedValue(FICHA);
  });

  it("mostra a alergia e só habilita ‘Entregar criança’ com 4 caracteres e quem busca", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByText("Alergia: amendoim")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Entregar criança" });
    expect(confirm).toBeDisabled();

    await fillCode(user, "a2b");
    await user.selectOptions(await screen.findByLabelText("Quem está buscando"), "p1");
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Código de retirada"), "3");
    expect(screen.getByLabelText("Código de retirada")).toHaveValue("A2B3");
    expect(confirm).toBeEnabled();
  });

  it("lista todos os responsáveis, inclusive quem não busca, para a tela não revelar a permissão", async () => {
    setup();
    const select = await screen.findByLabelText("Quem está buscando");
    expect(select).toHaveTextContent("Maria Souza (mãe)");
    expect(select).toHaveTextContent("Lúcia Souza (avó)");
  });

  it("entrega com o código e quem busca", async () => {
    const user = userEvent.setup();
    const { onDone } = setup();
    vi.mocked(checkOut).mockResolvedValue();
    await fillCode(user, "A2B3");
    await user.selectOptions(await screen.findByLabelText("Quem está buscando"), "p1");
    await user.click(screen.getByRole("button", { name: "Entregar criança" }));
    await waitFor(() => expect(checkOut).toHaveBeenCalledWith("c1", { code: "A2B3", picked_up_by_person_id: "p1" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("código errado (403) recusa com a frase única, limpa o código e deixa tentar de novo", async () => {
    const user = userEvent.setup();
    const { onDone } = setup();
    vi.mocked(checkOut).mockRejectedValueOnce(apiError(403, "Não foi possível confirmar a retirada. Chame o líder kids.")).mockResolvedValueOnce();
    await fillCode(user, "ZZZZ");
    await user.selectOptions(await screen.findByLabelText("Quem está buscando"), "p2");
    await user.click(screen.getByRole("button", { name: "Entregar criança" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Este código não é de quem está buscando. Chame o líder kids.");
    expect(REFUSAL).toBe("Este código não é de quem está buscando. Chame o líder kids.");
    // Não diz se foi o código ou a pessoa, nem quem pode retirar.
    expect(alert.textContent).not.toMatch(/autorizad|pode retirar|permiss/i);
    expect(screen.getByLabelText("Código de retirada")).toHaveValue("");
    expect(onDone).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Código de retirada"), "A2B3");
    await user.click(screen.getByRole("button", { name: "Entregar criança" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("outros erros não viram a recusa: dizem o que aconteceu", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(checkOut).mockRejectedValue(apiError(409, "Este check-in já foi encerrado"));
    await fillCode(user, "A2B3");
    await user.selectOptions(await screen.findByLabelText("Quem está buscando"), "p1");
    await user.click(screen.getByRole("button", { name: "Entregar criança" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este check-in já foi encerrado");
  });

  it("líder autoriza a saída por exceção: exige motivo de 5+ caracteres e nome", async () => {
    const user = userEvent.setup();
    const { onDone } = setup();
    vi.mocked(checkOutOverride).mockResolvedValue();
    await user.click(screen.getByRole("button", { name: "Sem o código? Líder autoriza a saída" }));

    expect(screen.getByRole("heading", { name: "Líder autoriza a saída" })).toBeInTheDocument();
    const authorize = screen.getByRole("button", { name: "Autorizar saída" });
    expect(authorize).toBeDisabled();
    await user.type(screen.getByLabelText("Quem está buscando"), "  Maria Souza ");
    await user.type(screen.getByLabelText("Motivo"), "abc");
    expect(authorize).toBeDisabled();
    await user.type(screen.getByLabelText("Motivo"), "de; conferi o RG");
    await user.click(authorize);

    await waitFor(() =>
      expect(checkOutOverride).toHaveBeenCalledWith("c1", { reason: "abcde; conferi o RG", picked_up_by_name: "Maria Souza" }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("falha na exceção aparece; ‘Voltar ao código’ retorna ao fluxo normal", async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(checkOutOverride).mockRejectedValue(apiError(403, "Só a liderança kids autoriza retirada por exceção"));
    await user.click(screen.getByRole("button", { name: "Sem o código? Líder autoriza a saída" }));
    await user.type(screen.getByLabelText("Quem está buscando"), "Maria");
    await user.type(screen.getByLabelText("Motivo"), "perdeu a etiqueta");
    await user.click(screen.getByRole("button", { name: "Autorizar saída" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Só a liderança kids autoriza");

    await user.click(screen.getByRole("button", { name: "Voltar ao código" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Código de retirada")).toBeInTheDocument();
  });

  it("quem não é líder não vê a exceção", async () => {
    setup(false);
    await screen.findByLabelText("Quem está buscando");
    expect(screen.queryByRole("button", { name: /Líder autoriza/ })).not.toBeInTheDocument();
  });

  it("sem alergia informada não desenha aviso; falha ao carregar responsáveis tem nova tentativa; Cancelar fecha", async () => {
    const user = userEvent.setup();
    vi.mocked(getChild).mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(FICHA);
    const onClose = vi.fn();
    render(
      <CheckoutDialog
        item={{ ...ITEM, has_allergy: false, allergies: null }}
        canOverride={false}
        onClose={onClose}
        onDone={vi.fn()}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os responsáveis");
    expect(screen.queryByText(/^Alergia:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByLabelText("Quem está buscando")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
