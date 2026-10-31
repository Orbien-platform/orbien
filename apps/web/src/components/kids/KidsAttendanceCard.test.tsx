import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAttendanceSummary, type KidsAttendanceSummary } from "@/lib/kids";
import { KidsAttendanceCard } from "./KidsAttendanceCard";

vi.mock("@/lib/api", () => ({
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
  default: {},
}));
vi.mock("@/lib/kids", async (orig) => ({
  ...(await orig<typeof import("@/lib/kids")>()),
  getAttendanceSummary: vi.fn(),
}));

const summary = (over: Partial<KidsAttendanceSummary> = {}): KidsAttendanceSummary => ({
  period: { date_from: "2026-08-01", date_to: "2026-10-26" },
  sessions_counted: 3,
  rooms: [
    { room_id: "r1", room_name: "Maternal", sessions_counted: 2, total_children: 13, average_children: 6.5 },
    { room_id: "r2", room_name: "Júnior", sessions_counted: 1, total_children: 8, average_children: 8 },
  ],
  ...over,
});
const httpError = (status: number) => Object.assign(new Error("x"), { isAxiosError: true, response: { status } });

describe("KidsAttendanceCard", () => {
  beforeEach(() => {
    vi.mocked(getAttendanceSummary).mockReset();
  });

  it("mostra a média por turma, só entre sessões com check-in, e pede o período certo", async () => {
    vi.mocked(getAttendanceSummary).mockResolvedValue(summary());
    render(<KidsAttendanceCard start="2026-08-01" end="2026-10-26" />);
    expect(await screen.findByText("Maternal")).toBeInTheDocument();
    expect(screen.getByText("6,5")).toBeInTheDocument();
    expect(screen.getByText(/por sessão · 2 sessões com check-in/)).toBeInTheDocument();
    expect(screen.getByText(/por sessão · 1 sessão com check-in/)).toBeInTheDocument();
    expect(screen.getByText(/Sessões sem check-in não entram/)).toBeInTheDocument();
    expect(getAttendanceSummary).toHaveBeenCalledWith({ date_from: "2026-08-01", date_to: "2026-10-26" });
  });

  it("sem nenhuma sessão com check-in é estado vazio, nunca zero", async () => {
    vi.mocked(getAttendanceSummary).mockResolvedValue(summary({ sessions_counted: 0, rooms: [] }));
    render(<KidsAttendanceCard start="2026-08-01" end="2026-10-26" />);
    expect(await screen.findByText("Sem check-in neste período")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("falha de carga é erro com nova tentativa, não vazio", async () => {
    const user = userEvent.setup();
    vi.mocked(getAttendanceSummary).mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(summary());
    render(<KidsAttendanceCard start="a" end="b" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar a presença do Kids.");
    expect(screen.queryByText("Sem check-in neste período")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Maternal")).toBeInTheDocument();
  });

  it("quem não lê o indicador (403) não vê o cartão", async () => {
    vi.mocked(getAttendanceSummary).mockRejectedValue(httpError(403));
    const { container } = render(<KidsAttendanceCard start="a" end="b" />);
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("recarrega ao mudar o período", async () => {
    vi.mocked(getAttendanceSummary).mockResolvedValue(summary());
    const { rerender } = render(<KidsAttendanceCard start="2026-08-01" end="2026-10-26" />);
    await screen.findByText("Maternal");
    rerender(<KidsAttendanceCard start="2026-01-01" end="2026-03-31" />);
    await vi.waitFor(() =>
      expect(getAttendanceSummary).toHaveBeenLastCalledWith({ date_from: "2026-01-01", date_to: "2026-03-31" }),
    );
  });

  describe("resposta de um período que já foi trocado", () => {
    const deferred = <T,>() => {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
    const atual = summary({ rooms: [{ room_id: "r3", room_name: "Berçário", sessions_counted: 1, total_children: 4, average_children: 4 }] });

    it("não sobrescreve o indicador do período atual quando chega depois dele", async () => {
      const antiga = deferred<KidsAttendanceSummary>();
      vi.mocked(getAttendanceSummary).mockReturnValueOnce(antiga.promise).mockResolvedValue(atual);
      const { rerender } = render(<KidsAttendanceCard start="2026-08-01" end="2026-10-26" />);
      rerender(<KidsAttendanceCard start="2026-09-01" end="2026-10-26" />);
      expect(await screen.findByText("Berçário")).toBeInTheDocument();

      antiga.resolve(summary());
      await waitFor(() => expect(screen.queryByText("Maternal")).not.toBeInTheDocument());
      expect(screen.getByText("Berçário")).toBeInTheDocument();
    });

    it("falha tardia do período antigo não esconde nem marca erro no indicador atual", async () => {
      const antiga = deferred<KidsAttendanceSummary>();
      vi.mocked(getAttendanceSummary).mockReturnValueOnce(antiga.promise).mockResolvedValue(atual);
      const { rerender } = render(<KidsAttendanceCard start="2026-08-01" end="2026-10-26" />);
      rerender(<KidsAttendanceCard start="2026-09-01" end="2026-10-26" />);
      expect(await screen.findByText("Berçário")).toBeInTheDocument();

      antiga.reject(httpError(403));
      await waitFor(() => expect(getAttendanceSummary).toHaveBeenCalledTimes(2));
      expect(screen.getByText("Berçário")).toBeInTheDocument();
    });
  });
});
