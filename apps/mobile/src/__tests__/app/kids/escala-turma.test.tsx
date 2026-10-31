// Minhas escalas mostra a turma da sessão kids (T34, KIDS-10): turma e horário
// do culto, atalho para a turma, e escala comum sem nada de kids.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (callback: () => () => void) => {
      useEffect(() => callback(), [callback]);
    },
  };
});

const mockGetMyAssignments = jest.fn();
jest.mock("../../../lib/escala/escala-client", () => ({
  getMyAssignments: (...a: unknown[]) => mockGetMyAssignments(...a),
  getMySwapRequests: () => Promise.resolve({ incoming: [], outgoing: [] }),
  respondToAssignment: jest.fn(),
  checkIn: jest.fn(),
}));

import EscalaScreen from "../../../app/escala";

const BASE = {
  id: "a1",
  status: "confirmed",
  notified_at: null,
  responded_at: null,
  checked_in_at: null,
  celebration: { id: "c1", name: "Culto de domingo", start_time: "10:00" },
  ministry: { id: "m1", name: "Kids" },
  scheduled_date: "2026-11-01T00:00:00.000Z",
  service_order_id: null,
  setlist: null,
};
const OPEN_SESSION = { id: "s1", room_id: "r1", room_name: "Maternal", status: "open" };

async function renderScreen(assignments: object[]) {
  mockGetMyAssignments.mockResolvedValue(assignments);
  await act(async () => {
    render(<EscalaScreen />);
  });
}

describe("Minhas escalas — turma kids", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mostra a turma da sessão, ao lado do horário do culto", async () => {
    await renderScreen([{ ...BASE, kids_session: OPEN_SESSION }]);
    expect(screen.getByText("Turma Maternal")).toBeTruthy();
    expect(screen.getByText(/10:00/)).toBeTruthy();
  });

  it("'Abrir turma' leva ao roster da sessão", async () => {
    await renderScreen([{ ...BASE, kids_session: OPEN_SESSION }]);
    await act(async () => {
      fireEvent.press(screen.getByTestId("turma-a1"));
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/kids/sessao/[id]", params: { id: "s1" } });
  });

  it("sessão cancelada aparece como cancelada, sem atalho", async () => {
    await renderScreen([{ ...BASE, kids_session: { ...OPEN_SESSION, status: "cancelled" } }]);
    expect(screen.getByText("Turma Maternal (cancelada)")).toBeTruthy();
    expect(screen.queryByTestId("turma-a1")).toBeNull();
  });

  it("escala recusada não oferece abrir a turma", async () => {
    await renderScreen([{ ...BASE, status: "declined", kids_session: OPEN_SESSION }]);
    expect(screen.queryByTestId("turma-a1")).toBeNull();
  });

  it.each([["sem o campo", {}], ["com null", { kids_session: null }]])(
    "escala comum (%s) não mostra nada de kids",
    async (_label, extra) => {
      await renderScreen([{ ...BASE, ministry: { id: "m2", name: "Louvor" }, ...extra }]);
      expect(screen.queryByTestId("assignment-a1-turma")).toBeNull();
      expect(screen.queryByTestId("turma-a1")).toBeNull();
    },
  );
});
