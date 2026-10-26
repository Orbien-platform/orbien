import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChild, getConsent, searchPersons, updateChild, type KidsFicha } from "@/lib/kids";
import { ChildFormModal } from "./ChildFormModal";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
  default: {},
}));
vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  createChild: vi.fn(),
  updateChild: vi.fn(),
  getConsent: vi.fn(),
  searchPersons: vi.fn(),
}));

const TERM = "Autorizo a igreja a tratar os dados do meu filho.";
const httpError = (status: number, message?: string) =>
  Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { message } } });

function setupCreate() {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(<ChildFormModal open onOpenChange={onOpenChange} child={null} onSaved={onSaved} />);
  return { onSaved, onOpenChange };
}

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome da criança"), " Davi ");
  await user.type(screen.getByLabelText("Data de nascimento"), "2022-03-10");
}

async function pickGuardian(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("Buscar o responsável pelo nome"), "mar");
  await user.click(await screen.findByRole("button", { name: "Maria Souza" }));
}

describe("ChildFormModal — cadastro pela secretaria", () => {
  beforeEach(() => {
    for (const fn of [createChild, updateChild, getConsent, searchPersons]) vi.mocked(fn).mockReset();
    vi.mocked(searchPersons).mockResolvedValue([{ id: "p1", full_name: "Maria Souza" }]);
  });

  it("sem consentimento vigente exige o aceite do termo e manda register_consent", async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = setupCreate();
    vi.mocked(getConsent).mockResolvedValue({ valid: false, term_version: "v1", term_text: TERM });
    vi.mocked(createChild).mockResolvedValue({ id: "k1", full_name: "Davi", birth_date: null, household_id: null });

    await fillBasics(user);
    await user.type(screen.getByLabelText("Alergias e restrições"), "amendoim");
    await pickGuardian(user);
    await user.type(screen.getByLabelText("Parentesco"), "mãe");

    expect(await screen.findByText("Falta o consentimento do responsável")).toBeInTheDocument();
    expect(screen.getByText(TERM)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Cadastrar criança" });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /leu e aceitou o termo/ }));
    await user.click(save);

    await waitFor(() =>
      expect(createChild).toHaveBeenCalledWith({
        full_name: "Davi",
        birth_date: "2022-03-10",
        allergies: "amendoim",
        relationship: "mãe",
        guardian_person_id: "p1",
        register_consent: true,
      }),
    );
    expect(onSaved).toHaveBeenCalledWith("k1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("com consentimento vigente não pede o aceite nem manda register_consent", async () => {
    const user = userEvent.setup();
    setupCreate();
    vi.mocked(getConsent).mockResolvedValue({ valid: true, term_version: "v1", term_text: TERM });
    vi.mocked(createChild).mockResolvedValue({ id: "k1", full_name: "Davi", birth_date: null, household_id: null });

    await fillBasics(user);
    await pickGuardian(user);
    expect(await screen.findByText("Consentimento do responsável vigente.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /leu e aceitou/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cadastrar criança" }));

    await waitFor(() => expect(createChild).toHaveBeenCalled());
    expect(vi.mocked(createChild).mock.calls[0][0]).not.toHaveProperty("register_consent");
    expect(vi.mocked(createChild).mock.calls[0][0]).not.toHaveProperty("allergies");
  });

  it("não cadastra sem responsável escolhido, e deixa trocar o escolhido", async () => {
    const user = userEvent.setup();
    setupCreate();
    vi.mocked(getConsent).mockResolvedValue({ valid: true, term_version: "v1", term_text: TERM });
    await fillBasics(user);
    expect(screen.getByRole("button", { name: "Cadastrar criança" })).toBeDisabled();
    await pickGuardian(user);
    expect(await screen.findByText("Consentimento do responsável vigente.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Trocar" }));
    expect(screen.getByPlaceholderText("Buscar o responsável pelo nome")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cadastrar criança" })).toBeDisabled();
  });

  it("busca sem resultado explica que o responsável precisa estar em Pessoas", async () => {
    const user = userEvent.setup();
    setupCreate();
    vi.mocked(searchPersons).mockResolvedValue([]);
    await user.type(screen.getByPlaceholderText("Buscar o responsável pelo nome"), "zzz");
    expect(await screen.findByText(/Ninguém encontrado/)).toBeInTheDocument();
  });

  it("termo curto demais não busca; apagar a busca limpa os resultados", async () => {
    const user = userEvent.setup();
    setupCreate();
    const input = screen.getByPlaceholderText("Buscar o responsável pelo nome");
    await user.type(input, "mar");
    await screen.findByRole("button", { name: "Maria Souza" });
    await user.clear(input);
    await user.type(input, "m");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Maria Souza" })).not.toBeInTheDocument());
  });

  it("papel sem acesso a Pessoas recebe a explicação, não uma lista vazia", async () => {
    const user = userEvent.setup();
    setupCreate();
    vi.mocked(searchPersons).mockRejectedValue(httpError(403));
    await user.type(screen.getByPlaceholderText("Buscar o responsável pelo nome"), "mar");
    expect(await screen.findByRole("alert")).toHaveTextContent("Seu papel não busca pessoas");
  });

  it("outra falha na busca mostra a mensagem genérica", async () => {
    const user = userEvent.setup();
    setupCreate();
    vi.mocked(searchPersons).mockRejectedValue(httpError(500));
    await user.type(screen.getByPlaceholderText("Buscar o responsável pelo nome"), "mar");
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível buscar pessoas.");
  });

  it("falha ao conferir o consentimento é dita, e o servidor pode recusar o cadastro", async () => {
    const user = userEvent.setup();
    setupCreate();
    vi.mocked(getConsent).mockRejectedValueOnce(httpError(500));
    await fillBasics(user);
    await pickGuardian(user);
    expect(await screen.findByText("Não foi possível conferir o consentimento.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Trocar" }));
    vi.mocked(getConsent).mockResolvedValue({ valid: true, term_version: "v1", term_text: TERM });
    vi.mocked(createChild).mockRejectedValue(httpError(422, "É preciso o consentimento do responsável para cadastrar a criança"));
    await pickGuardian(user);
    await user.click(await screen.findByRole("button", { name: "Cadastrar criança" }));
    expect(await screen.findByText(/É preciso o consentimento/)).toBeInTheDocument();
  });
});

describe("ChildFormModal — edição", () => {
  const FICHA: KidsFicha = {
    id: "k1",
    full_name: "Davi",
    birth_date: "2022-03-10T00:00:00.000Z",
    household_id: "h1",
    allergies: "amendoim",
    medical_notes: null,
    guardians: [],
  };

  beforeEach(() => {
    vi.mocked(updateChild).mockReset();
  });

  it("edita sem pedir responsável e limpa o que foi esvaziado", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<ChildFormModal open onOpenChange={vi.fn()} child={FICHA} onSaved={onSaved} />);
    vi.mocked(updateChild).mockResolvedValue({ id: "k1", full_name: "Davi Lima", birth_date: null, household_id: null });

    expect(screen.queryByText("Responsável")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Data de nascimento")).toHaveValue("2022-03-10");
    await user.type(screen.getByLabelText("Nome da criança"), " Lima");
    await user.clear(screen.getByLabelText("Alergias e restrições"));
    await user.click(screen.getByRole("button", { name: "Salvar criança" }));

    await waitFor(() =>
      expect(updateChild).toHaveBeenCalledWith("k1", {
        full_name: "Davi Lima",
        birth_date: "2022-03-10",
        allergies: null,
        medical_notes: null,
      }),
    );
    expect(onSaved).toHaveBeenCalledWith("k1");
  });

  it("abre vazio para uma criança sem nascimento e Voltar fecha", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ChildFormModal open onOpenChange={onOpenChange} child={{ ...FICHA, birth_date: null, allergies: null }} onSaved={vi.fn()} />,
    );
    expect(screen.getByLabelText("Data de nascimento")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Salvar criança" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
