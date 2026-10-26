import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getChild,
  getConsent,
  registerConsent,
  removeGuardian,
  revokeConsent,
  type KidsFicha,
  type KidsGuardian,
} from "@/lib/kids";
import { ChildFicha } from "./ChildFicha";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
  default: {},
}));
vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  getChild: vi.fn(),
  getConsent: vi.fn(),
  registerConsent: vi.fn(),
  revokeConsent: vi.fn(),
  removeGuardian: vi.fn(),
}));
vi.mock("@/components/kids/ChildFormModal", () => ({
  ChildFormModal: ({ onSaved, onOpenChange }: { onSaved: () => void; onOpenChange: (o: boolean) => void }) => (
    <div data-testid="child-form">
      <button onClick={onSaved}>salvou criança</button>
      <button onClick={() => onOpenChange(false)}>fechou criança</button>
    </div>
  ),
}));
vi.mock("@/components/kids/GuardianFormModal", () => ({
  GuardianFormModal: ({ guardian, onOpenChange }: { guardian: KidsGuardian | null; onOpenChange: (o: boolean) => void }) => (
    <div data-testid="guardian-form">
      guardião:{guardian ? guardian.full_name : "novo"}
      <button onClick={() => onOpenChange(false)}>fechou guardião</button>
    </div>
  ),
}));

const MARIA: KidsGuardian = {
  id: "g1",
  guardian_person_id: "p1",
  full_name: "Maria Souza",
  phone: "11999990000",
  photo_url: null,
  relationship: "mãe",
  can_pickup: true,
  is_primary: true,
};
const LUCIA: KidsGuardian = {
  id: "g2",
  guardian_person_id: "p2",
  full_name: "Lúcia Souza",
  phone: null,
  photo_url: null,
  relationship: "avó",
  can_pickup: false,
  is_primary: false,
};
const FICHA: KidsFicha = {
  id: "k1",
  full_name: "Davi Souza",
  birth_date: "2022-03-10T00:00:00.000Z",
  household_id: "h1",
  allergies: "amendoim",
  medical_notes: "usa bombinha",
  guardians: [MARIA, LUCIA],
};
const CONSENT_OK = { valid: true, term_version: "v1", term_text: "Termo kids" };
const CONSENT_PENDING = { valid: false, term_version: "v1", term_text: "Termo kids" };
const httpError = (status: number, message?: string) =>
  Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { message } } });

function setup(canManage = true) {
  const onBack = vi.fn();
  const onChanged = vi.fn();
  render(<ChildFicha childId="k1" canManage={canManage} onBack={onBack} onChanged={onChanged} />);
  return { onBack, onChanged };
}

describe("ChildFicha", () => {
  beforeEach(() => {
    for (const fn of [getChild, getConsent, registerConsent, revokeConsent, removeGuardian]) vi.mocked(fn).mockReset();
    vi.mocked(getChild).mockResolvedValue(FICHA);
    vi.mocked(getConsent).mockResolvedValue(CONSENT_OK);
  });

  it("põe a alergia em destaque, com texto, e lista os responsáveis", async () => {
    setup();
    expect(await screen.findByRole("heading", { name: "Davi Souza" })).toBeInTheDocument();
    expect(screen.getByText("Alergia: amendoim")).toBeInTheDocument();
    expect(screen.getByText(/usa bombinha/)).toBeInTheDocument();
    expect(screen.getByText("Responsáveis e autorizados (2)")).toBeInTheDocument();
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getByText("Primário")).toBeInTheDocument();
    expect(screen.getByText("Pode buscar")).toBeInTheDocument();
    expect(screen.getByText("Não busca")).toBeInTheDocument();
    expect(screen.getByText(/Maria Souza consentiu/)).toBeInTheDocument();
    expect(getConsent).toHaveBeenCalledWith("p1");
  });

  it("sem alergia informada diz isso, sem inventar aviso", async () => {
    vi.mocked(getChild).mockResolvedValue({ ...FICHA, allergies: null, medical_notes: null, birth_date: null });
    setup();
    expect(await screen.findByText("Nenhuma alergia informada.")).toBeInTheDocument();
    expect(screen.queryByText(/^Alergia:/)).not.toBeInTheDocument();
    expect(screen.getByText("Sem data de nascimento")).toBeInTheDocument();
  });

  it("falha de carga é erro com nova tentativa", async () => {
    const user = userEvent.setup();
    vi.mocked(getChild).mockRejectedValueOnce(httpError(500));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar a ficha.");
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("heading", { name: "Davi Souza" })).toBeInTheDocument();
  });

  it("403 diz que falta acesso à ficha", async () => {
    vi.mocked(getChild).mockRejectedValue(httpError(403));
    setup();
    expect(await screen.findByText(/Você não tem acesso a fichas de crianças/)).toBeInTheDocument();
  });

  it("quem não gerencia só lê: sem ações de edição", async () => {
    setup(false);
    await screen.findByRole("heading", { name: "Davi Souza" });
    expect(screen.queryByRole("button", { name: "Editar criança" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remover/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Autorizar uma pessoa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /consentimento/i })).not.toBeInTheDocument();
  });

  it("edita a criança e os responsáveis pelos formulários", async () => {
    const user = userEvent.setup();
    const { onChanged } = setup();
    await screen.findByRole("heading", { name: "Davi Souza" });

    await user.click(screen.getByRole("button", { name: "Editar criança" }));
    await user.click(screen.getByRole("button", { name: "salvou criança" }));
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(getChild).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "fechou criança" }));
    expect(screen.queryByTestId("child-form")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Autorizar uma pessoa" }));
    expect(screen.getByTestId("guardian-form")).toHaveTextContent("guardião:novo");
    await user.click(screen.getByRole("button", { name: "fechou guardião" }));
    await user.click(screen.getByRole("button", { name: "Editar Lúcia Souza" }));
    expect(screen.getByTestId("guardian-form")).toHaveTextContent("guardião:Lúcia Souza");
  });

  it("remove um responsável com confirmação; a recusa do servidor aparece no diálogo", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole("heading", { name: "Davi Souza" });
    vi.mocked(removeGuardian).mockRejectedValueOnce(httpError(422, "A criança precisa de um responsável primário")).mockResolvedValueOnce();

    await user.click(screen.getByRole("button", { name: "Remover Maria Souza" }));
    await user.click(screen.getByRole("button", { name: "Remover responsável" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("precisa de um responsável primário");

    await user.click(within(dialog).getByRole("button", { name: "Remover responsável" }));
    await waitFor(() => expect(removeGuardian).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Remover este responsável?")).not.toBeInTheDocument());
  });

  it("Voltar do diálogo de remoção fecha sem remover", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole("heading", { name: "Davi Souza" });
    await user.click(screen.getByRole("button", { name: "Remover Lúcia Souza" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Voltar" }));
    expect(removeGuardian).not.toHaveBeenCalled();
  });

  it("consentimento pendente avisa que não há check-in; registrar exige o aceite", async () => {
    const user = userEvent.setup();
    vi.mocked(getConsent).mockResolvedValue(CONSENT_PENDING);
    vi.mocked(registerConsent).mockResolvedValue();
    setup();
    expect(await screen.findByText(/ainda não consentiu/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar consentimento" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Termo kids")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Registrar consentimento" });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(confirm);
    await waitFor(() => expect(registerConsent).toHaveBeenCalledWith("p1", "v1"));
  });

  it("revoga o consentimento com confirmação; Voltar fecha", async () => {
    const user = userEvent.setup();
    vi.mocked(revokeConsent).mockResolvedValue();
    setup();
    await screen.findByText(/Maria Souza consentiu/);

    await user.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(revokeConsent).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Revogar consentimento" }));
    await waitFor(() => expect(revokeConsent).toHaveBeenCalledWith("p1"));
  });

  it("erro ao registrar o consentimento fica no diálogo", async () => {
    const user = userEvent.setup();
    vi.mocked(getConsent).mockResolvedValue(CONSENT_PENDING);
    vi.mocked(registerConsent).mockRejectedValue(httpError(409, "O termo foi atualizado"));
    setup();
    await user.click(await screen.findByRole("button", { name: "Registrar consentimento" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Registrar consentimento" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("O termo foi atualizado");
  });

  it("não conseguir ler o consentimento não derruba a ficha", async () => {
    vi.mocked(getConsent).mockRejectedValue(httpError(500));
    setup();
    expect(await screen.findByText(/Não foi possível conferir o consentimento de Maria Souza/)).toBeInTheDocument();
    expect(screen.getByText("Alergia: amendoim")).toBeInTheDocument();
  });

  it("criança sem responsável primário não tenta ler consentimento", async () => {
    vi.mocked(getChild).mockResolvedValue({ ...FICHA, guardians: [LUCIA] });
    setup();
    expect(await screen.findByText("A criança não tem responsável primário.")).toBeInTheDocument();
    expect(getConsent).not.toHaveBeenCalled();
  });

  it("voltar para a lista chama onBack", async () => {
    const user = userEvent.setup();
    const { onBack } = setup();
    await screen.findByRole("heading", { name: "Davi Souza" });
    await user.click(screen.getByRole("button", { name: /Voltar para crianças/ }));
    expect(onBack).toHaveBeenCalled();
  });
});
