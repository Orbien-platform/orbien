// Modal obrigatório de confirmação de cadastro: só aparece com dado faltando,
// pede só o que falta, só habilita com tudo válido, não tem saída além de
// confirmar ou sair da conta.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockLogout = jest.fn();
jest.mock("../../lib/auth/auth-provider", () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

const mockGaps = jest.fn();
const mockUpdate = jest.fn();
jest.mock("../../lib/privacidade/privacidade-client", () => ({
  getProfileGaps: () => mockGaps(),
  updateMyData: (...args: unknown[]) => mockUpdate(...args),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import { ProfileGapsModal } from "../../components/ProfileGapsModal";

async function open(gaps: string[]) {
  mockGaps.mockResolvedValue(gaps);
  await act(async () => {
    render(<ProfileGapsModal />);
  });
}

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

describe("ProfileGapsModal", () => {
  beforeEach(() => jest.clearAllMocks());

  it("cadastro completo: não aparece", async () => {
    await open([]);
    expect(screen.queryByText("Confirme seus dados")).toBeNull();
  });

  it("pede só o que falta e mantém o botão desabilitado até tudo valer", async () => {
    await open(["phone", "birth_date"]);
    expect(screen.queryByTestId("gaps-gender")).toBeNull();

    await press("gaps-save");
    expect(mockUpdate).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId("gaps-phone"), "11988887777");
      fireEvent.changeText(screen.getByTestId("gaps-birth-date"), "31041990");
    });
    expect(screen.getByTestId("gaps-birth-date").props.value).toBe("31/04/1990");
    await press("gaps-save");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("salva com dados válidos e some", async () => {
    mockUpdate.mockResolvedValue({});
    await open(["gender", "phone", "birth_date"]);
    await press("gaps-gender-female");
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("gaps-phone"), "11988887777");
      fireEvent.changeText(screen.getByTestId("gaps-birth-date"), "01051990");
    });
    expect(screen.getByTestId("gaps-phone").props.value).toBe("(11) 98888-7777");
    await press("gaps-save");

    expect(mockUpdate).toHaveBeenCalledWith({
      gender: "female",
      phone: "11988887777",
      birth_date: "1990-05-01",
    });
    expect(screen.queryByText("Confirme seus dados")).toBeNull();
  });

  it("falha de rede mantém o modal e os dados", async () => {
    mockUpdate.mockRejectedValue(new NetworkError());
    await open(["gender"]);
    await press("gaps-gender-male");
    await press("gaps-save");
    expect(screen.getByTestId("gaps-error")).toBeTruthy();
    expect(screen.getByText("Confirme seus dados")).toBeTruthy();
  });

  it("erro 400 da API mostra a mensagem dela; outro erro mostra o aviso genérico", async () => {
    await open(["gender"]);
    await press("gaps-gender-male");

    mockUpdate.mockRejectedValueOnce(new HttpError(400, { message: "Sexo inválido" }));
    await press("gaps-save");
    expect(screen.getByTestId("gaps-error")).toHaveTextContent("Sexo inválido");

    mockUpdate.mockRejectedValueOnce(new Error("boom"));
    await press("gaps-save");
    expect(screen.getByTestId("gaps-error")).toHaveTextContent(/^Não foi possível salvar\./);
  });

  it("telefone incompleto ou data impossível mantêm o botão sem efeito", async () => {
    await open(["phone", "birth_date"]);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("gaps-phone"), "1198");
      fireEvent.changeText(screen.getByTestId("gaps-birth-date"), "01051990");
    });
    await press("gaps-save");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("permite sair da conta", async () => {
    mockLogout.mockResolvedValue(undefined);
    await open(["gender"]);
    await press("gaps-logout");
    expect(mockLogout).toHaveBeenCalled();
  });
});
