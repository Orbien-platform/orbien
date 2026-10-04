// Cadastrar visitante (v2): valida o nome, envia, mostra quem já tem o
// mesmo telefone e mantém os campos quando o envio falha.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
}));

const mockRegister = jest.fn();
jest.mock("../../lib/visitantes/visitantes-client", () => ({
  registerVisitor: (...args: unknown[]) => mockRegister(...args),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import VisitanteScreen from "../../app/visitante";

async function fillAndSubmit(name = "Ana Souza", phone = "(11) 99999-0000") {
  await act(async () => {
    render(<VisitanteScreen />);
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId("visitante-nome"), name);
    fireEvent.changeText(screen.getByTestId("visitante-telefone"), phone);
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId("visitante-enviar"));
  });
}

describe("VisitanteScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("não envia sem nome", async () => {
    await act(async () => {
      render(<VisitanteScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("visitante-enviar"));
    });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("cadastra e confirma, sem duplicados", async () => {
    mockRegister.mockResolvedValue({
      person: { id: "p1", full_name: "Ana Souza" },
      possible_duplicates: [],
    });
    await fillAndSubmit();

    expect(mockRegister).toHaveBeenCalledWith({
      full_name: "Ana Souza",
      phone: "(11) 99999-0000",
      email: "",
    });
    expect(screen.getByTestId("visitante-sucesso-msg").props.children).toBe(
      "Ana Souza foi cadastrado como visitante.",
    );
    expect(screen.queryByTestId("visitante-duplicados")).toBeNull();
  });

  it("mostra quem já tem o mesmo telefone", async () => {
    mockRegister.mockResolvedValue({
      person: { id: "p1", full_name: "Ana Souza" },
      possible_duplicates: [
        { id: "p0", full_name: "Ana S.", phone: "11999990000", classification: "attendee" },
      ],
    });
    await fillAndSubmit();

    expect(screen.getByTestId("visitante-duplicados")).toBeTruthy();
    expect(screen.getByText("Ana S.")).toBeTruthy();
  });

  it("sem conexão, avisa e mantém o que foi digitado", async () => {
    mockRegister.mockRejectedValue(new NetworkError());
    await fillAndSubmit();

    expect(screen.getByTestId("visitante-erro").props.children).toMatch(/Sem conexão/);
    expect(screen.getByTestId("visitante-nome").props.value).toBe("Ana Souza");
  });

  it("403 explica que o papel não cadastra", async () => {
    mockRegister.mockRejectedValue(new HttpError(403, { message: "Forbidden" }));
    await fillAndSubmit();

    expect(screen.getByTestId("visitante-erro").props.children).toMatch(/papel/);
  });

  it("'Cadastrar outro' limpa o formulário", async () => {
    mockRegister.mockResolvedValue({
      person: { id: "p1", full_name: "Ana Souza" },
      possible_duplicates: [],
    });
    await fillAndSubmit();
    await act(async () => {
      fireEvent.press(screen.getByTestId("visitante-outro"));
    });

    expect(screen.getByTestId("visitante-nome").props.value).toBe("");
  });
});
