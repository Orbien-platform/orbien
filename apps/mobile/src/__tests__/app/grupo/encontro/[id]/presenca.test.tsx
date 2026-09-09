// Testes derivados do Done-when de T9 (tasks.md, MOB-09-06/07/08): roster
// × já marcado, seleção e envio em lote, erro preserva seleção.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "m1" }),
}));

const mockGetMeeting = jest.fn();
const mockGetGroupRoster = jest.fn();
const mockRecordAttendance = jest.fn();
jest.mock("../../../../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  getMeeting: (...args: unknown[]) => mockGetMeeting(...args),
  getGroupRoster: (...args: unknown[]) => mockGetGroupRoster(...args),
  recordAttendance: (...args: unknown[]) => mockRecordAttendance(...args),
}));

import PresencaScreen from "../../../../../app/grupo/encontro/[id]/presenca";

const ROSTER = [
  { person_id: "p1", full_name: "Ana", role: "leader" as const },
  { person_id: "p2", full_name: "Bia", role: "member" as const },
  { person_id: "p3", full_name: "Caio", role: "member" as const },
];

describe("PresencaScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGroupRoster.mockResolvedValue(ROSTER);
  });

  it("roster mostra todo membro; quem já tem AttendanceRecord aparece marcado, sem opção de desmarcar (MOB-09-06)", async () => {
    mockGetMeeting.mockResolvedValue({
      id: "m1",
      small_group_id: "sg1",
      occurred_at: "2026-09-01T19:00:00.000Z",
      topic: null,
      attendanceRecords: [{ person_id: "p1" }],
    });

    await act(async () => {
      render(<PresencaScreen />);
    });

    expect(mockGetGroupRoster).toHaveBeenCalledWith("sg1");
    expect(screen.getByTestId("roster-p1-marcado")).toBeTruthy();
    expect(screen.queryByTestId("roster-p1-toggle")).toBeNull();
    expect(screen.getByTestId("roster-p2-toggle")).toBeTruthy();
    expect(screen.getByTestId("roster-p3-toggle")).toBeTruthy();
  });

  it("encontro sem nenhum AttendanceRecord mostra todo o roster não marcado, sem erro (edge case)", async () => {
    mockGetMeeting.mockResolvedValue({
      id: "m1",
      small_group_id: "sg1",
      occurred_at: "2026-09-01T19:00:00.000Z",
      topic: null,
      attendanceRecords: [],
    });

    await act(async () => {
      render(<PresencaScreen />);
    });

    expect(screen.queryByTestId("presenca-error")).toBeNull();
    expect(screen.getByTestId("roster-p1-toggle")).toBeTruthy();
    expect(screen.getByTestId("roster-p2-toggle")).toBeTruthy();
    expect(screen.getByTestId("roster-p3-toggle")).toBeTruthy();
  });

  it("selecionar membros e confirmar chama recordAttendance com os person_ids marcados e reflete sem reload manual (MOB-09-07)", async () => {
    mockGetMeeting.mockResolvedValue({
      id: "m1",
      small_group_id: "sg1",
      occurred_at: "2026-09-01T19:00:00.000Z",
      topic: null,
      attendanceRecords: [],
    });
    mockRecordAttendance.mockResolvedValue({ added: 2 });

    await act(async () => {
      render(<PresencaScreen />);
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("roster-p2-toggle"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("roster-p3-toggle"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("presenca-confirmar"));
    });

    expect(mockRecordAttendance).toHaveBeenCalledWith("m1", ["p2", "p3"]);
    await waitFor(() => expect(screen.getByTestId("roster-p2-marcado")).toBeTruthy());
    expect(screen.getByTestId("roster-p3-marcado")).toBeTruthy();
  });

  it("falha no envio mostra erro E preserva a seleção já feita (MOB-09-08)", async () => {
    mockGetMeeting.mockResolvedValue({
      id: "m1",
      small_group_id: "sg1",
      occurred_at: "2026-09-01T19:00:00.000Z",
      topic: null,
      attendanceRecords: [],
    });
    mockRecordAttendance.mockRejectedValue(new Error("network"));

    await act(async () => {
      render(<PresencaScreen />);
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("roster-p2-toggle"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("presenca-confirmar"));
    });

    expect(screen.getByTestId("presenca-submit-error")).toBeTruthy();
    // Seleção preservada: p2 continua "Selecionado", não some nem vira "Presente".
    expect(screen.getByTestId("roster-p2-toggle")).toHaveTextContent("Selecionado");
    expect(screen.queryByTestId("roster-p2-marcado")).toBeNull();
  });

  it("erro ao carregar o encontro mostra estado de erro explícito", async () => {
    mockGetMeeting.mockRejectedValue(new Error("network"));

    await act(async () => {
      render(<PresencaScreen />);
    });

    expect(screen.getByTestId("presenca-error")).toBeTruthy();
  });

  it("erro ao carregar oferece tentar novamente, que refaz a busca", async () => {
    mockGetMeeting.mockRejectedValueOnce(new Error("network"));
    mockGetMeeting.mockResolvedValueOnce({
      id: "m1",
      small_group_id: "sg1",
      occurred_at: "2026-09-01T19:00:00.000Z",
      topic: null,
      attendanceRecords: [],
    });

    await act(async () => {
      render(<PresencaScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("presenca-retry"));
    });

    expect(mockGetMeeting).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("presenca-roster")).toBeTruthy();
  });
});
