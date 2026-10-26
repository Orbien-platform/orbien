// Kids — cadastro de criança (T31, KIDS-04/06): termo antes do formulário,
// validação local, envio com nascimento em ISO e volta ao termo no 422.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockGetStatus = jest.fn();
const mockAccept = jest.fn();
const mockCreate = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  getConsentStatus: (...a: unknown[]) => mockGetStatus(...a),
  acceptConsent: (...a: unknown[]) => mockAccept(...a),
  createChild: (...a: unknown[]) => mockCreate(...a),
}));

import { HttpError, NetworkError } from "../../../lib/api/errors";
import NovaCriancaScreen from "../../../app/kids/crianca/novo";

const TERM = { valid: false, term_version: "kids-2026-10", term_text: "Termo do ministério infantil." };

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}
async function type(testID: string, text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId(testID), text);
  });
}
async function renderScreen() {
  await act(async () => {
    render(<NovaCriancaScreen />);
  });
}
async function fill() {
  await type("nova-nome", "  Ana Souza ");
  await type("nova-nascimento", "04032022");
}

describe("NovaCriancaScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sem consentimento mostra o termo, não o formulário", async () => {
    mockGetStatus.mockResolvedValue(TERM);
    await renderScreen();
    expect(screen.getByTestId("nova-consent-intro")).toBeTruthy();
    expect(screen.getByText("Termo do ministério infantil.")).toBeTruthy();
    expect(screen.queryByTestId("nova-nome")).toBeNull();
  });

  it("aceitar o termo libera o formulário", async () => {
    mockGetStatus.mockResolvedValueOnce(TERM).mockResolvedValueOnce({ ...TERM, valid: true });
    mockAccept.mockResolvedValue(undefined);
    await renderScreen();
    await press("consent-accept");
    expect(screen.getByTestId("nova-nome")).toBeTruthy();
  });

  it("recusa nome vazio e nascimento inválido sem chamar a API", async () => {
    mockGetStatus.mockResolvedValue({ ...TERM, valid: true });
    await renderScreen();

    await press("nova-salvar");
    expect(screen.getByTestId("nova-form-error").props.children).toBe("Informe o nome da criança.");

    await type("nova-nome", "Ana");
    await type("nova-nascimento", "31022022");
    await press("nova-salvar");
    expect(screen.getByTestId("nova-form-error").props.children).toBe(
      "Informe a data de nascimento no formato DD/MM/AAAA.",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("cadastra com nascimento em ISO, texto aparado e abre a ficha", async () => {
    mockGetStatus.mockResolvedValue({ ...TERM, valid: true });
    mockCreate.mockResolvedValue({ id: "c9" });
    await renderScreen();
    await fill();
    await type("nova-alergia", " amendoim ");
    await type("nova-observacao", "usa inalador");
    await type("nova-parentesco", "mãe");
    await press("nova-salvar");

    expect(mockCreate).toHaveBeenCalledWith({
      full_name: "Ana Souza",
      birth_date: "2022-03-04",
      allergies: "amendoim",
      medical_notes: "usa inalador",
      relationship: "mãe",
    });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/kids/crianca/[id]", params: { id: "c9" } });
  });

  it("omite os campos opcionais vazios", async () => {
    mockGetStatus.mockResolvedValue({ ...TERM, valid: true });
    mockCreate.mockResolvedValue({ id: "c9" });
    await renderScreen();
    await fill();
    await press("nova-salvar");
    expect(mockCreate).toHaveBeenCalledWith({ full_name: "Ana Souza", birth_date: "2022-03-04" });
  });

  it("422 de consentimento volta ao termo", async () => {
    mockGetStatus.mockResolvedValueOnce({ ...TERM, valid: true }).mockResolvedValueOnce(TERM);
    mockCreate.mockRejectedValue(new HttpError(422, { code: "kids_consent_required", message: "É preciso o consentimento" }));
    await renderScreen();
    await fill();
    await press("nova-salvar");
    expect(screen.getByTestId("nova-consent-intro")).toBeTruthy();
  });

  it("falha de rede no envio mostra a mensagem genérica e mantém o formulário", async () => {
    mockGetStatus.mockResolvedValue({ ...TERM, valid: true });
    mockCreate.mockRejectedValue(new NetworkError());
    await renderScreen();
    await fill();
    await press("nova-salvar");
    expect(screen.getByTestId("nova-form-error").props.children).toBe(
      "Não foi possível cadastrar a criança. Tente novamente.",
    );
    expect(screen.getByTestId("nova-nome").props.value).toBe("  Ana Souza ");
  });

  it("erro ao carregar o termo oferece tentar de novo", async () => {
    mockGetStatus.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce({ ...TERM, valid: true });
    await renderScreen();
    expect(screen.getByTestId("nova-error")).toBeTruthy();
    await press("nova-retry");
    expect(screen.getByTestId("nova-nome")).toBeTruthy();
  });
});
