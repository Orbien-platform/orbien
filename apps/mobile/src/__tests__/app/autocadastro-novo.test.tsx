// Novo QR de autocadastro: origem, grupo (só para "Grupo"), nome opcional,
// criação e abertura do QR em tela cheia.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockCreate = jest.fn();
const mockListGroups = jest.fn();
jest.mock("../../lib/visitantes/visitantes-client", () => ({
  ...jest.requireActual("../../lib/visitantes/visitantes-client"),
  createSignupQr: (...args: unknown[]) => mockCreate(...args),
  listGroupOptions: () => mockListGroups(),
}));

import AutocadastroNovoScreen from "../../app/autocadastro-novo";

const created = (o: Record<string, unknown> = {}) => ({
  id: "q1",
  token: "tok-1",
  origin: "service",
  label: null,
  is_active: true,
  scan_count: 0,
  created_at: "2026-10-01T10:00:00.000Z",
  ...o,
});

async function open() {
  await render(<AutocadastroNovoScreen />);
  await act(async () => undefined);
}

describe("AutocadastroNovoScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("cria o QR do culto sem nome e abre o QR", async () => {
    mockCreate.mockResolvedValue(created());
    await open();

    expect(screen.queryByTestId("novo-grupo")).toBeNull();
    await act(async () => {
      await fireEvent.press(screen.getByTestId("novo-criar"));
    });
    expect(mockCreate).toHaveBeenCalledWith("service", "", undefined);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/autocadastro-qr",
      params: { token: "tok-1", title: "Culto" },
    });
  });

  it("evento com nome usa o nome como título", async () => {
    mockCreate.mockResolvedValue(created({ origin: "event", label: "Retiro" }));
    await open();

    await fireEvent.press(screen.getByTestId("novo-origem-event"));
    await fireEvent.changeText(screen.getByTestId("novo-nome"), "Retiro");
    await act(async () => {
      await fireEvent.press(screen.getByTestId("novo-criar"));
    });
    expect(mockCreate).toHaveBeenCalledWith("event", "Retiro", undefined);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/autocadastro-qr",
      params: { token: "tok-1", title: "Retiro" },
    });
  });

  it("Grupo exige escolher o grupo antes de criar e o envia", async () => {
    mockListGroups.mockResolvedValue([{ id: "g1", name: "PG Centro" }]);
    mockCreate.mockResolvedValue(created({ origin: "small_group" }));
    await open();

    await fireEvent.press(screen.getByTestId("novo-origem-small_group"));
    await act(async () => undefined);
    await act(async () => {
      await fireEvent.press(screen.getByTestId("novo-criar"));
    });
    expect(mockCreate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("novo-grupo-g1"));
    await act(async () => {
      await fireEvent.press(screen.getByTestId("novo-criar"));
    });
    expect(mockCreate).toHaveBeenCalledWith("small_group", "", "g1");
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/autocadastro-qr",
      params: { token: "tok-1", title: "PG Centro" },
    });
  });

  it("trocar a origem zera o grupo escolhido", async () => {
    mockListGroups.mockResolvedValue([{ id: "g1", name: "PG Centro" }]);
    mockCreate.mockResolvedValue(created());
    await open();

    await fireEvent.press(screen.getByTestId("novo-origem-small_group"));
    await act(async () => undefined);
    await fireEvent.press(screen.getByTestId("novo-grupo-g1"));
    await fireEvent.press(screen.getByTestId("novo-origem-service"));
    await act(async () => {
      await fireEvent.press(screen.getByTestId("novo-criar"));
    });
    expect(mockCreate).toHaveBeenCalledWith("service", "", undefined);
  });

  it("falha ao carregar os grupos avisa; sem grupos também", async () => {
    mockListGroups.mockRejectedValueOnce(new Error("x"));
    await open();
    await fireEvent.press(screen.getByTestId("novo-origem-small_group"));
    await act(async () => undefined);
    expect(screen.getByTestId("novo-grupos-erro")).toBeTruthy();
  });

  it("igreja sem grupos mostra o aviso e não deixa criar", async () => {
    mockListGroups.mockResolvedValue([]);
    await open();
    await fireEvent.press(screen.getByTestId("novo-origem-small_group"));
    await act(async () => undefined);
    expect(screen.getByText("A igreja ainda não tem grupos.")).toBeTruthy();
    await act(async () => {
      await fireEvent.press(screen.getByTestId("novo-criar"));
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("falha ao criar avisa, não navega e libera tentar de novo; toque duplo cria um só", async () => {
    mockCreate.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(created());
    await open();

    await act(async () => {
      fireEvent.press(screen.getByTestId("novo-criar"));
      fireEvent.press(screen.getByTestId("novo-criar"));
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("novo-erro")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("novo-criar"));
    });
    expect(mockReplace).toHaveBeenCalled();
  });
});
