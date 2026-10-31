// Kids — adicionar autorizado (T31, KIDS-05).
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: "c1" }),
}));

const mockAdd = jest.fn();
jest.mock("../../../lib/kids/kids-client", () => ({
  ...jest.requireActual("../../../lib/kids/kids-client"),
  addGuardian: (...a: unknown[]) => mockAdd(...a),
}));

import { HttpError } from "../../../lib/api/errors";
import AutorizadoScreen from "../../../app/kids/crianca/[id]/autorizado";

async function renderScreen() {
  await act(async () => {
    render(<AutorizadoScreen />);
  });
}
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

describe("AutorizadoScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["sem nome", { nome: "", telefone: "11988887777", parentesco: "avó" }, "Informe o nome de quem vai buscar."],
    ["telefone curto", { nome: "Vó Lúcia", telefone: "1198", parentesco: "avó" }, "Informe o telefone com DDD."],
    ["sem parentesco", { nome: "Vó Lúcia", telefone: "11988887777", parentesco: " " }, "Informe o parentesco (avó, tio, vizinha...)."],
  ])("recusa %s sem chamar a API", async (_label, v, message) => {
    await renderScreen();
    await type("autorizado-nome", v.nome);
    await type("autorizado-telefone", v.telefone);
    await type("autorizado-parentesco", v.parentesco);
    await press("autorizado-salvar");
    expect(screen.getByTestId("autorizado-error").props.children).toBe(message);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("adiciona com telefone só em dígitos e volta para a ficha", async () => {
    await renderScreen();
    mockAdd.mockResolvedValue({});
    await type("autorizado-nome", " Vó Lúcia ");
    await type("autorizado-telefone", "11988887777");
    await type("autorizado-parentesco", "avó");
    await press("autorizado-salvar");
    expect(mockAdd).toHaveBeenCalledWith("c1", {
      full_name: "Vó Lúcia",
      phone: "11988887777",
      relationship: "avó",
      can_pickup: true,
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it("pode cadastrar alguém que não retira", async () => {
    await renderScreen();
    mockAdd.mockResolvedValue({});
    await type("autorizado-nome", "Tio Beto");
    await type("autorizado-telefone", "1133334444");
    await type("autorizado-parentesco", "tio");
    await act(async () => {
      fireEvent(screen.getByTestId("autorizado-pode-retirar"), "valueChange", false);
    });
    await press("autorizado-salvar");
    expect(mockAdd).toHaveBeenCalledWith("c1", expect.objectContaining({ can_pickup: false }));
  });

  it("mostra a regra recusada pela API e fica na tela", async () => {
    await renderScreen();
    mockAdd.mockRejectedValue(new HttpError(422, { message: "Esta pessoa já é autorizada" }));
    await type("autorizado-nome", "Vó Lúcia");
    await type("autorizado-telefone", "11988887777");
    await type("autorizado-parentesco", "avó");
    await press("autorizado-salvar");
    expect(screen.getByTestId("autorizado-error").props.children).toBe("Esta pessoa já é autorizada");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("falha sem regra cai na mensagem genérica", async () => {
    await renderScreen();
    mockAdd.mockRejectedValue(new Error("rede"));
    await type("autorizado-nome", "Vó Lúcia");
    await type("autorizado-telefone", "11988887777");
    await type("autorizado-parentesco", "avó");
    await press("autorizado-salvar");
    expect(screen.getByTestId("autorizado-error").props.children).toBe("Não foi possível adicionar. Tente novamente.");
  });
});
