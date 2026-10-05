// Blocos do Início por papel (PROD-30). Cada bloco busca o que precisa e some
// se não houver nada — os testes cobrem o gate de papel, o caso feliz e o
// silêncio em erro.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock("../lib/theme/theme-provider", () => ({
  useTheme: () => {
    const { palettes } = jest.requireActual("../lib/theme/tokens");
    return {
      colors: palettes.light,
      primaryColor: "#1E3A7B",
      accentReadable: "#1E3A7B",
      shadow: { sm: {} },
    };
  },
}));
jest.mock("../lib/theme/terminology", () => ({
  useGroupTerm: () => ({ singular: "Célula", plural: "Células" }),
}));

const mockListMeetings = jest.fn();
const mockHealthSummary = jest.fn();
jest.mock("../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  listMeetings: (...a: unknown[]) => mockListMeetings(...a),
  getHealthSummary: (...a: unknown[]) => mockHealthSummary(...a),
}));
const mockListUpcoming = jest.fn();
jest.mock("../lib/celebracoes/celebracoes-client", () => ({
  listUpcomingInstances: (...a: unknown[]) => mockListUpcoming(...a),
}));
const mockGetAssignments = jest.fn();
const mockRespond = jest.fn();
jest.mock("../lib/escala/escala-client", () => ({
  getMyAssignments: (...a: unknown[]) => mockGetAssignments(...a),
  respondToAssignment: (...a: unknown[]) => mockRespond(...a),
}));

import type { SmallGroupMine } from "../lib/pequenos-grupos/types";
import { HomeRoleBlocks } from "./HomeRoleBlocks";

const leaderGroup: SmallGroupMine = {
  id: "g1",
  name: "Vila Mariana",
  meeting_time: "20:00",
  recurrence: null,
  role: "leader",
};

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    status: "pending",
    celebration: { id: "c1", name: "Celebração da manhã", start_time: "10:00" },
    ministry: { id: "m1", name: "Mídia" },
    scheduled_date: "2026-10-11T00:00:00.000Z",
    ...overrides,
  };
}

async function renderBlocks(
  props: Partial<React.ComponentProps<typeof HomeRoleBlocks>> = {},
) {
  await act(async () => {
    render(
      <HomeRoleBlocks
        roles={["member"]}
        groups={[]}
        areas={["volunteers"]}
        isPremium={false}
        {...props}
      />,
    );
  });
}

describe("HomeRoleBlocks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListMeetings.mockResolvedValue([]);
    mockHealthSummary.mockResolvedValue({ green: 3, yellow: 2, red: 1, total: 6 });
    mockListUpcoming.mockResolvedValue([]);
    mockGetAssignments.mockResolvedValue([]);
  });

  describe("encontro de hoje", () => {
    it("líder com encontro hoje vê presença e QR do encontro", async () => {
      mockListMeetings.mockResolvedValue([
        { id: "e-ontem", occurred_at: "2020-01-01T20:00:00", topic: null },
        {
          id: "e-hoje",
          occurred_at: new Date().toISOString(),
          topic: "A fé de Abraão",
        },
      ]);
      await renderBlocks({ groups: [leaderGroup] });

      expect(screen.getByText("A fé de Abraão")).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByTestId("home-meeting-attendance"));
      });
      expect(mockPush).toHaveBeenCalledWith("/grupo/encontro/e-hoje/presenca");
      await act(async () => {
        fireEvent.press(screen.getByTestId("home-meeting-qr"));
      });
      expect(mockPush).toHaveBeenCalledWith("/grupo/encontro/e-hoje/qr");
    });

    it("membro comum não dispara a busca", async () => {
      await renderBlocks({ groups: [{ ...leaderGroup, role: "member" }] });
      expect(mockListMeetings).not.toHaveBeenCalled();
    });

    it("sem encontro hoje o bloco some", async () => {
      await renderBlocks({ groups: [leaderGroup] });
      expect(screen.queryByTestId("home-today-meeting")).toBeNull();
    });

    it("falha ao listar encontros não derruba a Home", async () => {
      mockListMeetings.mockRejectedValue(new Error("offline"));
      await renderBlocks({ groups: [leaderGroup] });
      expect(screen.queryByTestId("home-today-meeting")).toBeNull();
    });
  });

  describe("semáforo", () => {
    it("pastor Premium vê a contagem por cor", async () => {
      await renderBlocks({ roles: ["pastor"], isPremium: true });

      expect(screen.getByText("6 células")).toBeTruthy();
      expect(within(screen.getByTestId("home-health-green")).getByText("3")).toBeTruthy();
      expect(within(screen.getByTestId("home-health-yellow")).getByText("2")).toBeTruthy();
      expect(within(screen.getByTestId("home-health-red")).getByText("1")).toBeTruthy();
    });

    it("uma só célula usa o singular do termo da igreja", async () => {
      mockHealthSummary.mockResolvedValue({ green: 1, yellow: 0, red: 0, total: 1 });
      await renderBlocks({ roles: ["pastor"], isPremium: true });
      expect(screen.getByText("1 célula")).toBeTruthy();
    });

    it("Starter não busca, nem para o pastor", async () => {
      await renderBlocks({ roles: ["pastor"], isPremium: false });
      expect(mockHealthSummary).not.toHaveBeenCalled();
    });

    it("papel sem gestão não busca, mesmo no Premium", async () => {
      await renderBlocks({ roles: ["cell_leader"], isPremium: true });
      expect(mockHealthSummary).not.toHaveBeenCalled();
    });

    it("sem células ou com erro (403), o bloco some", async () => {
      mockHealthSummary.mockResolvedValue({ green: 0, yellow: 0, red: 0, total: 0 });
      await renderBlocks({ roles: ["pastor"], isPremium: true });
      expect(screen.queryByTestId("home-health")).toBeNull();
    });

    it("erro ao carregar não derruba a Home", async () => {
      mockHealthSummary.mockRejectedValue(new Error("403"));
      await renderBlocks({ roles: ["pastor"], isPremium: true });
      expect(screen.queryByTestId("home-health")).toBeNull();
    });
  });

  describe("celebração", () => {
    const instance = (id: string, date: string, order: unknown) => ({
      id,
      scheduled_date: date,
      celebration: {
        id: "c",
        name: `Culto ${id}`,
        type: "sunday",
        start_time: "10:00",
      },
      serviceOrder: order,
    });

    it("papel de ministério vê a próxima celebração e abre a OC publicada", async () => {
      mockListUpcoming.mockResolvedValue([
        instance("b", "2026-10-18T00:00:00.000Z", null),
        instance("a", "2026-10-11T00:00:00.000Z", {
          id: "oc1",
          title: "OC",
          published_at: "2026-10-09",
        }),
      ]);
      await renderBlocks({ roles: ["ministry_leader"] });

      expect(screen.getByText("Culto a")).toBeTruthy();
      expect(screen.getByText("OC publicada")).toBeTruthy();
      fireEvent.press(screen.getByLabelText("Culto a"));
      expect(mockPush).toHaveBeenCalledWith("/celebracao/oc1");
    });

    it("membro comum nem busca a celebração", async () => {
      await renderBlocks({ roles: ["member"] });
      expect(mockListUpcoming).not.toHaveBeenCalled();
    });

    it("sem OC, o toque abre a lista", async () => {
      mockListUpcoming.mockResolvedValue([
        instance("a", "2026-10-11T00:00:00.000Z", null),
      ]);
      await renderBlocks({ roles: ["pastor"] });
      expect(screen.getByText("OC ainda não publicada")).toBeTruthy();
      fireEvent.press(screen.getByLabelText("Culto a"));
      expect(mockPush).toHaveBeenCalledWith("/celebracoes");
    });
  });

  describe("escalas", () => {
    it("confirma a escala pendente e esconde os botões", async () => {
      mockGetAssignments.mockResolvedValue([assignment()]);
      mockRespond.mockResolvedValue({ status: "confirmed" });
      await renderBlocks();

      await act(async () => {
        fireEvent.press(screen.getByTestId("home-assignment-confirm"));
      });

      expect(mockRespond).toHaveBeenCalledWith("a1", "confirmed");
      expect(screen.getByText("Confirmada")).toBeTruthy();
      expect(screen.queryByTestId("home-assignment-confirm")).toBeNull();
    });

    it("recusar tira a escala da Home", async () => {
      mockGetAssignments.mockResolvedValue([assignment()]);
      mockRespond.mockResolvedValue({ status: "declined" });
      await renderBlocks();

      await act(async () => {
        fireEvent.press(screen.getByTestId("home-assignment-decline"));
      });

      expect(screen.queryByTestId("home-assignments")).toBeNull();
    });

    it("falha ao responder avisa e mantém os botões", async () => {
      mockGetAssignments.mockResolvedValue([assignment()]);
      mockRespond.mockRejectedValue(new Error("500"));
      await renderBlocks();

      await act(async () => {
        fireEvent.press(screen.getByTestId("home-assignment-confirm"));
      });

      expect(screen.getByTestId("home-assignment-error")).toBeTruthy();
      expect(screen.getByTestId("home-assignment-confirm")).toBeTruthy();
    });

    it("sem a área volunteers não busca a escala", async () => {
      await renderBlocks({ areas: ["content"] });
      expect(mockGetAssignments).not.toHaveBeenCalled();
    });

    it("indisponibilidade leva à tela", async () => {
      mockGetAssignments.mockResolvedValue([
        assignment({ status: "confirmed" }),
      ]);
      await renderBlocks({ areas: null });
      fireEvent.press(screen.getByTestId("home-unavailability"));
      expect(mockPush).toHaveBeenCalledWith("/indisponibilidade");
    });
  });
});
