// Cadastrar visitante (v2): consentimento obrigatório, duplicado por telefone
// antes de criar ("mesma pessoa" × "outra pessoa"), origem "PG" só para quem
// lidera grupo, e os campos mantidos quando o envio falha.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
}));

const mockRegister = jest.fn();
const mockAnyway = jest.fn();
const mockExisting = jest.fn();
jest.mock("../../lib/visitantes/visitantes-client", () => ({
  registerVisitor: (...args: unknown[]) => mockRegister(...args),
  registerVisitorAnyway: (...args: unknown[]) => mockAnyway(...args),
  recordVisitForExisting: (...args: unknown[]) => mockExisting(...args),
}));

const mockListMyGroups = jest.fn();
jest.mock("../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  listMyGroups: () => mockListMyGroups(),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import VisitanteScreen from "../../app/visitante";

const REGISTERED = {
  status: "registered",
  person: { id: "p1", full_name: "Ana Souza" },
  reclassified: false,
};

async function fill(name = "Ana Souza", phone = "(11) 99999-0000", consent = true) {
  await act(async () => {
    render(<VisitanteScreen />);
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("visitante-nome"), name);
    fireEvent.changeText(screen.getByTestId("visitante-telefone"), phone);
    if (consent) fireEvent(screen.getByTestId("visitante-consentimento"), "valueChange", true);
  });
}

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

describe("VisitanteScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListMyGroups.mockResolvedValue([]);
  });

  it("sem o consentimento do visitante, não envia", async () => {
    await fill("Ana Souza", "", false);
    await press("visitante-enviar");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("sem nome, não envia", async () => {
    await fill("", "");
    await press("visitante-enviar");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("cadastra com sexo e origem escolhidos e confirma", async () => {
    mockRegister.mockResolvedValue(REGISTERED);
    await fill();
    await press("visitante-sexo-female");
    await press("visitante-origem-event");
    await press("visitante-enviar");

    expect(mockRegister).toHaveBeenCalledWith({
      full_name: "Ana Souza",
      phone: "(11) 99999-0000",
      email: "",
      origin: "event",
      gender: "female",
    });
    expect(screen.getByTestId("visitante-sucesso")).toBeTruthy();
    expect(screen.getByText("Visitante cadastrado")).toBeTruthy();
  });

  it("origem do grupo só para quem lidera, e a visita vai para o grupo", async () => {
    mockListMyGroups.mockResolvedValue([
      { id: "g-membro", name: "Outro", role: "member", meeting_time: null },
      { id: "g-lider", name: "Norte", role: "leader", meeting_time: null },
    ]);
    mockRegister.mockResolvedValue(REGISTERED);
    await fill();
    await press("visitante-origem-small_group");
    await press("visitante-enviar");

    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "small_group", small_group_id: "g-lider" }),
    );
  });

  it("sem grupo liderado, a origem do grupo não aparece", async () => {
    await fill();
    expect(screen.queryByTestId("visitante-origem-small_group")).toBeNull();
  });

  it("telefone já cadastrado: mostra quem tem e registra a visita da mesma pessoa", async () => {
    mockRegister.mockResolvedValue({
      status: "duplicate",
      matches: [
        {
          id: "p0",
          full_name: "André Costa",
          classification: "attendee",
          visits: 4,
          last_visit_at: "2026-04-27T12:00:00.000Z",
        },
      ],
    });
    mockExisting.mockResolvedValue({
      status: "visit_recorded",
      person: { id: "p0", full_name: "André Costa" },
      reclassified: false,
    });
    await fill();
    await press("visitante-enviar");

    expect(screen.getByTestId("visitante-duplicados")).toBeTruthy();
    expect(screen.getByText(/Frequentador · 4 visitas · última em 27 de abril de 2026/)).toBeTruthy();

    await press("visitante-mesma-pessoa-p0");
    expect(mockExisting).toHaveBeenCalledWith("p0", "service", undefined);
    expect(screen.getByText("Visita registrada")).toBeTruthy();
  });

  it("'é outra pessoa' cria mesmo com o telefone repetido", async () => {
    mockRegister.mockResolvedValue({
      status: "duplicate",
      matches: [{ id: "p0", full_name: "X", classification: "visitor", visits: 1, last_visit_at: null }],
    });
    mockAnyway.mockResolvedValue({ ...REGISTERED, reclassified: true });
    await fill();
    await press("visitante-enviar");
    await press("visitante-outra-pessoa");

    expect(mockAnyway).toHaveBeenCalledWith(expect.objectContaining({ full_name: "Ana Souza" }));
    expect(screen.getByText(/agora é frequentador/)).toBeTruthy();
  });

  it("voltar do duplicado devolve o formulário preenchido", async () => {
    mockRegister.mockResolvedValue({ status: "duplicate", matches: [] });
    await fill();
    await press("visitante-enviar");
    await press("visitante-voltar");
    expect(screen.getByTestId("visitante-nome").props.value).toBe("Ana Souza");
  });

  it("sem conexão, avisa e mantém o que foi digitado", async () => {
    mockRegister.mockRejectedValue(new NetworkError());
    await fill();
    await press("visitante-enviar");

    expect(screen.getByTestId("visitante-erro").props.children).toMatch(/Sem conexão/);
    expect(screen.getByTestId("visitante-nome").props.value).toBe("Ana Souza");
  });

  it("403 explica que o papel não cadastra; 400 mostra a mensagem da API; outro erro, genérico", async () => {
    mockRegister.mockRejectedValueOnce(new HttpError(403, { message: "Forbidden" }));
    await fill();
    await press("visitante-enviar");
    expect(screen.getByTestId("visitante-erro").props.children).toMatch(/papel/);

    mockRegister.mockRejectedValueOnce(new HttpError(400, { message: "Nome inválido" }));
    await press("visitante-enviar");
    expect(screen.getByTestId("visitante-erro").props.children).toBe("Nome inválido");

    mockRegister.mockRejectedValueOnce(new Error("boom"));
    await press("visitante-enviar");
    expect(screen.getByTestId("visitante-erro").props.children).toMatch(/Tente de novo/);
  });

  it("'Cadastrar outro' limpa o formulário e 'Concluir' volta", async () => {
    mockRegister.mockResolvedValue(REGISTERED);
    await fill();
    await press("visitante-enviar");
    await press("visitante-concluir");
    expect(mockBack).toHaveBeenCalled();

    await press("visitante-outro");
    expect(screen.getByTestId("visitante-nome").props.value).toBe("");
  });
});
