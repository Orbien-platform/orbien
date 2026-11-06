// Gerenciar QR: mostrar, renomear, ligar/desligar.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

const mockUpdate = jest.fn();
jest.mock("../../lib/visitantes/visitantes-client", () => ({
  ...jest.requireActual("../../lib/visitantes/visitantes-client"),
  updateSignupQr: (...args: unknown[]) => mockUpdate(...args),
}));

import AutocadastroEditarScreen from "../../app/autocadastro-editar";

const qr = (o: Record<string, unknown> = {}) => ({
  id: "q1",
  token: "tok-1",
  origin: "service",
  label: "Culto",
  is_active: true,
  scan_count: 3,
  created_at: "2026-10-01T10:00:00.000Z",
  ...o,
});

describe("AutocadastroEditarScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "q1", token: "tok-1", origin: "service", label: "Culto", active: "1", scans: "3" };
  });

  it("mostra o QR em tela cheia com token e título", async () => {
    await render(<AutocadastroEditarScreen />);
    expect(screen.getByText("Culto · Ativo · 3 cadastros")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("editar-mostrar"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/autocadastro-qr",
      params: { token: "tok-1", title: "Culto" },
    });
  });

  it("renomeia: só habilita com mudança e manda o nome aparado", async () => {
    mockUpdate.mockResolvedValue(qr({ label: "Noite" }));
    await render(<AutocadastroEditarScreen />);

    await act(async () => {
      await fireEvent.press(screen.getByTestId("editar-salvar"));
    });
    expect(mockUpdate).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId("editar-nome"), "  Noite ");
    await act(async () => {
      await fireEvent.press(screen.getByTestId("editar-salvar"));
    });
    expect(mockUpdate).toHaveBeenCalledWith("q1", { label: "Noite" });
    expect(screen.getByTestId("editar-aviso")).toHaveTextContent("Nome salvo.");
    expect(screen.getByText("Noite")).toBeTruthy();
  });

  it("desativa e reativa; desativado não oferece Mostrar QR", async () => {
    mockUpdate
      .mockResolvedValueOnce(qr({ is_active: false }))
      .mockResolvedValueOnce(qr({ is_active: true }));
    await render(<AutocadastroEditarScreen />);

    await act(async () => {
      await fireEvent.press(screen.getByTestId("editar-alternar"));
    });
    expect(mockUpdate).toHaveBeenLastCalledWith("q1", { is_active: false });
    expect(screen.getByTestId("editar-aviso")).toHaveTextContent("QR desativado.");
    expect(screen.queryByTestId("editar-mostrar")).toBeNull();

    await act(async () => {
      await fireEvent.press(screen.getByTestId("editar-alternar"));
    });
    expect(mockUpdate).toHaveBeenLastCalledWith("q1", { is_active: true });
    expect(screen.getByTestId("editar-aviso")).toHaveTextContent("QR reativado.");
    expect(screen.getByTestId("editar-mostrar")).toBeTruthy();
  });

  it("chega desativado e sem nome: título pela origem", async () => {
    mockParams = { id: "q1", token: "t", origin: "event", label: "", active: "0", scans: "0" };
    await render(<AutocadastroEditarScreen />);
    expect(screen.getByText("Evento · Desativado · 0 cadastros")).toBeTruthy();
    expect(screen.queryByTestId("editar-mostrar")).toBeNull();
    expect(screen.getByTestId("editar-alternar")).toHaveTextContent("Reativar QR");
  });

  it("falha ao salvar avisa e mantém o estado", async () => {
    mockUpdate.mockRejectedValue(new Error("x"));
    await render(<AutocadastroEditarScreen />);
    await act(async () => {
      await fireEvent.press(screen.getByTestId("editar-alternar"));
    });
    expect(screen.getByTestId("editar-erro")).toBeTruthy();
    expect(screen.getByTestId("editar-alternar")).toHaveTextContent("Desativar QR");
  });
});
