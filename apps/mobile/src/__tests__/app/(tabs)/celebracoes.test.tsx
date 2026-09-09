// Testes derivados do Done-when de T5 (tasks.md, MOB-08): lista vem de
// getMyAssignments para member/volunteer e de listUpcomingInstances para
// ministry_leader+ (AC1/AC6); item sem OC não tem link; toque num item com
// OC navega para /celebracao/[id] com os params certos; estado vazio
// distinto por papel; erro de rede.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { NetworkError } from "../../../lib/api/errors";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseAuth = jest.fn();
jest.mock("../../../lib/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGetMyAssignments = jest.fn();
jest.mock("../../../lib/escala/escala-client", () => ({
  getMyAssignments: (...args: unknown[]) => mockGetMyAssignments(...args),
}));

const mockListUpcomingInstances = jest.fn();
jest.mock("../../../lib/celebracoes/celebracoes-client", () => ({
  listUpcomingInstances: (...args: unknown[]) => mockListUpcomingInstances(...args),
}));

import CelebracoesScreen from "../../../app/(tabs)/celebracoes";

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

describe("CelebracoesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("member/volunteer: lista vem de getMyAssignments (AC1)", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["volunteer"]));
    mockGetMyAssignments.mockResolvedValue([
      {
        id: "a1",
        celebration: { id: "c1", name: "Culto de Domingo" },
        ministry: { id: "min1", name: "Louvor" },
        scheduled_date: "2026-09-13T13:00:00.000Z",
        service_order_id: "ord1",
        status: "confirmed",
        notified_at: null,
        responded_at: null,
        checked_in_at: null,
        setlist: null,
      },
    ]);

    await act(async () => {
      render(<CelebracoesScreen />);
    });

    expect(mockGetMyAssignments).toHaveBeenCalledTimes(1);
    expect(mockListUpcomingInstances).not.toHaveBeenCalled();
    expect(screen.getByTestId("celebracao-a1")).toBeTruthy();
    expect(screen.getByText("Culto de Domingo")).toBeTruthy();
  });

  it("ministry_leader: lista vem de listUpcomingInstances, não de getMyAssignments (AC6)", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["ministry_leader"]));
    mockListUpcomingInstances.mockResolvedValue([
      {
        id: "i1",
        celebration: { id: "c1", name: "Culto da Congregação", type: "sunday" },
        scheduled_date: "2026-09-13T13:00:00.000Z",
        serviceOrder: { id: "ord2", title: "OC", published_at: null },
      },
    ]);

    await act(async () => {
      render(<CelebracoesScreen />);
    });

    expect(mockListUpcomingInstances).toHaveBeenCalledTimes(1);
    expect(mockGetMyAssignments).not.toHaveBeenCalled();
    expect(screen.getByTestId("celebracao-i1")).toBeTruthy();
    expect(screen.getByText("Culto da Congregação")).toBeTruthy();
  });

  it("item sem service_order_id não mostra o link de abrir a OC", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["volunteer"]));
    mockGetMyAssignments.mockResolvedValue([
      {
        id: "a1",
        celebration: { id: "c1", name: "Culto sem OC" },
        ministry: { id: "min1", name: "Louvor" },
        scheduled_date: "2026-09-13T13:00:00.000Z",
        service_order_id: null,
        status: "pending",
        notified_at: null,
        responded_at: null,
        checked_in_at: null,
        setlist: null,
      },
    ]);

    await act(async () => {
      render(<CelebracoesScreen />);
    });

    expect(screen.queryByTestId("celebracao-abrir-a1")).toBeNull();
  });

  it("toque num item vindo de assignment navega para /celebracao/[id] com id e ministryId", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["volunteer"]));
    mockGetMyAssignments.mockResolvedValue([
      {
        id: "a1",
        celebration: { id: "c1", name: "Culto de Domingo" },
        ministry: { id: "min1", name: "Louvor" },
        scheduled_date: "2026-09-13T13:00:00.000Z",
        service_order_id: "ord1",
        status: "confirmed",
        notified_at: null,
        responded_at: null,
        checked_in_at: null,
        setlist: null,
      },
    ]);

    await act(async () => {
      render(<CelebracoesScreen />);
    });
    fireEvent.press(screen.getByTestId("celebracao-abrir-a1"));

    expect(mockPush).toHaveBeenCalledWith("/celebracao/ord1?ministryId=min1");
  });

  it("toque num item vindo da lista do líder navega sem ministryId", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["ministry_leader"]));
    mockListUpcomingInstances.mockResolvedValue([
      {
        id: "i1",
        celebration: { id: "c1", name: "Culto da Congregação", type: "sunday" },
        scheduled_date: "2026-09-13T13:00:00.000Z",
        serviceOrder: { id: "ord2", title: "OC", published_at: null },
      },
    ]);

    await act(async () => {
      render(<CelebracoesScreen />);
    });
    fireEvent.press(screen.getByTestId("celebracao-abrir-i1"));

    expect(mockPush).toHaveBeenCalledWith("/celebracao/ord2");
  });

  it("lista vazia para volunteer mostra a mensagem específica de voluntário", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["volunteer"]));
    mockGetMyAssignments.mockResolvedValue([]);

    await act(async () => {
      render(<CelebracoesScreen />);
    });

    expect(screen.getByText("Você não tem celebrações próximas.")).toBeTruthy();
  });

  it("lista vazia para ministry_leader mostra a mensagem específica de líder", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["ministry_leader"]));
    mockListUpcomingInstances.mockResolvedValue([]);

    await act(async () => {
      render(<CelebracoesScreen />);
    });

    expect(screen.getByText("Nenhuma celebração agendada.")).toBeTruthy();
  });

  it("erro de rede mostra estado de erro explícito, não lista vazia", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["volunteer"]));
    mockGetMyAssignments.mockRejectedValue(new NetworkError());

    await act(async () => {
      render(<CelebracoesScreen />);
    });

    expect(screen.getByTestId("celebracoes-error")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível carregar as celebrações. Verifique sua conexão."),
    ).toBeTruthy();
  });
});
