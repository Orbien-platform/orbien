// Testes derivados do Done-when de T8 (tasks.md, MOB-09-04/05): abrir
// link, rich_text inline, file_url nulo desabilita, estado vazio, ação de
// presença condicional por papel.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "m1" }),
  useRouter: () => ({ push: mockPush }),
}));

const mockUseAuth = jest.fn();
jest.mock("../../../../lib/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockListMaterials = jest.fn();
jest.mock("../../../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  listMaterials: (...args: unknown[]) => mockListMaterials(...args),
}));

import EncontroScreen from "../../../../app/grupo/encontro/[id]";

function makeToken(payload: object): string {
  const base64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base64url({ alg: "HS256" })}.${base64url(payload)}.signature`;
}

function sessionWithRoles(roles: string[]) {
  return {
    session: {
      accessToken: makeToken({ sub: "u1", tenant_id: "t1", congregation_id: "g1", roles, exp: 9999999999 }),
      refreshToken: "r",
      accessTokenExpiresAt: 9999999999000,
    },
  };
}

describe("EncontroScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    mockUseAuth.mockReturnValue(sessionWithRoles(["member"]));
  });

  it("material pdf/doc com file_url abre o link ao tocar (AC3)", async () => {
    mockListMaterials.mockResolvedValue([
      {
        id: "gm1",
        visibility: "all",
        material: { id: "mat1", title: "Estudo", source_type: "pdf", file_url: "https://x.test/a.pdf", rich_content: null },
      },
    ]);

    await act(async () => {
      render(<EncontroScreen />);
    });
    fireEvent.press(screen.getByTestId("material-gm1-abrir"));

    expect(Linking.openURL).toHaveBeenCalledWith("https://x.test/a.pdf");
  });

  it("material pdf/doc com file_url nulo desabilita a ação, sem chamar Linking (edge case)", async () => {
    mockListMaterials.mockResolvedValue([
      {
        id: "gm1",
        visibility: "all",
        material: { id: "mat1", title: "Estudo", source_type: "doc", file_url: null, rich_content: null },
      },
    ]);

    await act(async () => {
      render(<EncontroScreen />);
    });
    const action = screen.getByTestId("material-gm1-abrir");
    expect(action.props.accessibilityState).toEqual({ disabled: true });

    fireEvent.press(action);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("material rich_text mostra o conteúdo na própria tela, sem link (AC4)", async () => {
    mockListMaterials.mockResolvedValue([
      {
        id: "gm1",
        visibility: "all",
        material: { id: "mat1", title: "Reflexão", source_type: "rich_text", file_url: null, rich_content: "Texto do estudo" },
      },
    ]);

    await act(async () => {
      render(<EncontroScreen />);
    });

    expect(screen.getByTestId("material-gm1-rich-content")).toHaveTextContent("Texto do estudo");
    expect(screen.queryByTestId("material-gm1-abrir")).toBeNull();
  });

  it("sem material visível mostra estado vazio explícito (AC5)", async () => {
    mockListMaterials.mockResolvedValue([]);

    await act(async () => {
      render(<EncontroScreen />);
    });

    expect(screen.getByTestId("encontro-materials-empty")).toBeTruthy();
    expect(screen.getByText("Nenhum material disponível para este encontro.")).toBeTruthy();
  });

  it("erro de rede mostra estado de erro explícito", async () => {
    mockListMaterials.mockRejectedValue(new Error("network"));

    await act(async () => {
      render(<EncontroScreen />);
    });

    expect(screen.getByTestId("encontro-error")).toBeTruthy();
  });

  it("erro de rede oferece tentar novamente, que refaz a busca", async () => {
    mockListMaterials.mockRejectedValueOnce(new Error("network"));
    mockListMaterials.mockResolvedValueOnce([]);

    await act(async () => {
      render(<EncontroScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("encontro-retry"));
    });

    expect(mockListMaterials).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("encontro-materials-empty")).toBeTruthy();
  });

  it("papel cell_leader vê 'Registrar presença'; member não vê", async () => {
    mockListMaterials.mockResolvedValue([]);
    mockUseAuth.mockReturnValue(sessionWithRoles(["cell_leader"]));

    await act(async () => {
      render(<EncontroScreen />);
    });

    expect(screen.getByTestId("registrar-presenca-link")).toBeTruthy();
  });

  it("papel member não vê 'Registrar presença'", async () => {
    mockListMaterials.mockResolvedValue([]);
    mockUseAuth.mockReturnValue(sessionWithRoles(["member"]));

    await act(async () => {
      render(<EncontroScreen />);
    });

    expect(screen.queryByTestId("registrar-presenca-link")).toBeNull();
  });

  it("tocar em 'Registrar presença' navega para a tela de presença", async () => {
    mockListMaterials.mockResolvedValue([]);
    mockUseAuth.mockReturnValue(sessionWithRoles(["cell_leader"]));

    await act(async () => {
      render(<EncontroScreen />);
    });
    fireEvent.press(screen.getByTestId("registrar-presenca-link"));

    expect(mockPush).toHaveBeenCalledWith("/grupo/encontro/m1/presenca");
  });
});
