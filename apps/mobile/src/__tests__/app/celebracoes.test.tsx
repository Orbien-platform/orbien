// Tela Celebrações: a agenda aparece para todo membro (listAgenda), e
// ministry_leader+ usa listUpcomingInstances, que traz a OC. A escala
// (getMyAssignments) só marca os cultos em que a pessoa serve e abre a OC
// para ela. Quem não está escalado nem é líder vê o culto e a data, sem OC.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { NetworkError } from "../../lib/api/errors";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseAuth = jest.fn();
jest.mock("../../lib/auth/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGetMyAssignments = jest.fn();
jest.mock("../../lib/escala/escala-client", () => ({
  getMyAssignments: (...args: unknown[]) => mockGetMyAssignments(...args),
}));

const mockListUpcomingInstances = jest.fn();
const mockListAgenda = jest.fn();
jest.mock("../../lib/celebracoes/celebracoes-client", () => ({
  listUpcomingInstances: (...args: unknown[]) => mockListUpcomingInstances(...args),
  listAgenda: (...args: unknown[]) => mockListAgenda(...args),
}));

import CelebracoesScreen from "../../app/celebracoes";

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

const agendaDomingo = {
  id: "i1",
  scheduled_date: "2026-09-27T00:00:00.000Z",
  celebration: { id: "c1", name: "Celebração de domingo", type: "sunday", start_time: "19:00" },
};

function assignment(overrides: object = {}) {
  return {
    id: "a1",
    celebration: { id: "c1", name: "Celebração de domingo" },
    ministry: { id: "min1", name: "Louvor" },
    scheduled_date: "2026-09-27T00:00:00.000Z",
    service_order_id: "ord1",
    status: "confirmed",
    notified_at: null,
    responded_at: null,
    checked_in_at: null,
    setlist: null,
    ...overrides,
  };
}

async function renderScreen() {
  await act(async () => {
    render(<CelebracoesScreen />);
  });
}

describe("CelebracoesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMyAssignments.mockResolvedValue([]);
  });

  it("membro sem escala vê o culto, o dia e o horário — sem OC", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["member"]));
    mockListAgenda.mockResolvedValue([agendaDomingo]);

    await renderScreen();

    expect(mockListAgenda).toHaveBeenCalledTimes(1);
    expect(mockListUpcomingInstances).not.toHaveBeenCalled();
    expect(screen.getByText("Celebração de domingo")).toBeTruthy();
    // Domingo às 19:00 — não a véspera às 21:00, que é o que a meia-noite
    // UTC vira em Brasília.
    expect(screen.getByText("dom, 27 set · 19:00")).toBeTruthy();
    expect(screen.queryByTestId("celebracao-escalado-i1")).toBeNull();
    expect(screen.queryByTestId("celebracao-abrir-i1")).toBeNull();
    expect(screen.queryByText("Ordem de Culto ainda não publicada")).toBeNull();
  });

  it("membro escalado vê a marca do ministério e abre a OC com ministryId", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["volunteer"]));
    mockListAgenda.mockResolvedValue([agendaDomingo]);
    mockGetMyAssignments.mockResolvedValue([assignment()]);

    await renderScreen();

    expect(screen.getByText("Você serve em Louvor")).toBeTruthy();
    // Um card só: a escala casa com a agenda pelo culto e pelo dia.
    expect(screen.queryByTestId("celebracao-a1")).toBeNull();
    fireEvent.press(screen.getByTestId("celebracao-abrir-i1"));
    expect(mockPush).toHaveBeenCalledWith("/celebracao/ord1?ministryId=min1");
  });

  it("escalado sem OC ainda vê o aviso de OC não publicada, sem link", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["volunteer"]));
    mockListAgenda.mockResolvedValue([agendaDomingo]);
    mockGetMyAssignments.mockResolvedValue([assignment({ service_order_id: null })]);

    await renderScreen();

    expect(screen.getByText("Ordem de Culto ainda não publicada")).toBeTruthy();
    expect(screen.queryByTestId("celebracao-abrir-i1")).toBeNull();
  });

  it("escala sem par na agenda continua aparecendo", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["volunteer"]));
    mockListAgenda.mockResolvedValue([]);
    mockGetMyAssignments.mockResolvedValue([assignment()]);

    await renderScreen();

    expect(screen.getByTestId("celebracao-a1")).toBeTruthy();
    expect(screen.getByText("Você serve em Louvor")).toBeTruthy();
  });

  it("ministry_leader: lista vem de listUpcomingInstances e abre a OC sem ministryId", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["ministry_leader"]));
    mockListUpcomingInstances.mockResolvedValue([
      { ...agendaDomingo, serviceOrder: { id: "ord2", title: "OC", published_at: null } },
    ]);

    await renderScreen();

    expect(mockListAgenda).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("celebracao-abrir-i1"));
    expect(mockPush).toHaveBeenCalledWith("/celebracao/ord2");
  });

  it("papel sem rota de escala (secretary) ainda vê a agenda", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["secretary"]));
    mockListUpcomingInstances.mockResolvedValue([{ ...agendaDomingo, serviceOrder: null }]);
    mockGetMyAssignments.mockRejectedValue(new Error("403"));

    await renderScreen();

    expect(screen.getByText("Celebração de domingo")).toBeTruthy();
  });

  it("agenda vazia mostra a mensagem de nenhuma celebração", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["member"]));
    mockListAgenda.mockResolvedValue([]);

    await renderScreen();

    expect(screen.getByText("Nenhuma celebração agendada.")).toBeTruthy();
  });

  it("erro de rede mostra estado de erro explícito, não lista vazia", async () => {
    mockUseAuth.mockReturnValue(sessionWithRoles(["volunteer"]));
    mockListAgenda.mockRejectedValue(new NetworkError());

    await renderScreen();

    expect(screen.getByTestId("celebracoes-error")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível carregar as celebrações. Verifique sua conexão."),
    ).toBeTruthy();
  });
});
