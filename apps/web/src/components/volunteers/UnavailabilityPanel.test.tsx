import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnavailabilityPanel } from "./UnavailabilityPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

describe("UnavailabilityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and shows no marked days by default", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null });
    render(<UnavailabilityPanel />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        `/volunteers/unavailability?month=${currentMonth}&year=${currentYear}`
      )
    );
    expect(
      await screen.findByText("Nenhum dia marcado — você está disponível todo o mês.")
    ).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fail"));
    render(<UnavailabilityPanel />);
    expect(
      await screen.findByText("Não foi possível carregar suas indisponibilidades.")
    ).toBeInTheDocument();
  });

  it("pre-marks the days returned by the API", async () => {
    const day15 = `${currentYear}-${String(currentMonth).padStart(2, "0")}-15`;
    vi.mocked(api.get).mockResolvedValue({
      data: { id: "u1", reference_month: currentMonth, reference_year: currentYear, notes: "Viagem", dates: [{ date: day15 }] },
    });
    render(<UnavailabilityPanel />);

    const dayButton = await screen.findByRole("button", { name: `15 de ${monthName(currentMonth)}` });
    expect(dayButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("Viagem")).toBeInTheDocument();
    expect(screen.getByText("1 dia marcado.")).toBeInTheDocument();
  });

  it("toggles a day and saves the updated set", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<UnavailabilityPanel />);

    await screen.findByText("Nenhum dia marcado — você está disponível todo o mês.");
    await user.click(screen.getByRole("button", { name: `10 de ${monthName(currentMonth)}` }));
    expect(screen.getByText("1 dia marcado.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const expectedDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-10`;
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/volunteers/unavailability", {
        referenceMonth: currentMonth,
        referenceYear: currentYear,
        dates: [expectedDate],
        notes: undefined,
      })
    );
    expect(await screen.findByText("Indisponibilidades salvas.")).toBeInTheDocument();
  });

  it("shows an error message when saving fails", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null });
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    render(<UnavailabilityPanel />);

    await screen.findByText("Nenhum dia marcado — você está disponível todo o mês.");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("Não foi possível salvar suas indisponibilidades.")
    ).toBeInTheDocument();
  });

  it("shows the API's error message when loading fails with a server message", async () => {
    vi.mocked(api.get).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Sessão expirada." } },
    });
    render(<UnavailabilityPanel />);

    expect(await screen.findByText("Sessão expirada.")).toBeInTheDocument();
  });

  it("shows the API's error message when saving fails with a server message", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null });
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Mês já fechado." } },
    });
    const user = userEvent.setup();
    render(<UnavailabilityPanel />);

    await screen.findByText("Nenhum dia marcado — você está disponível todo o mês.");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Mês já fechado.")).toBeInTheDocument();
  });

  it("ignores a load response that resolves after the component unmounted", async () => {
    let resolveGet!: (value: { data: null }) => void;
    vi.mocked(api.get).mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      }) as ReturnType<typeof api.get>
    );
    const { unmount } = render(<UnavailabilityPanel />);
    unmount();

    // Should not trigger a "state update on unmounted component" warning,
    // since the effect cleanup marks the request as cancelled.
    resolveGet({ data: null });
    await Promise.resolve();
    await Promise.resolve();
  });

  it("ignores a load rejection that resolves after the component unmounted", async () => {
    let rejectGet!: (err: unknown) => void;
    vi.mocked(api.get).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectGet = reject;
      }) as ReturnType<typeof api.get>
    );
    const { unmount } = render(<UnavailabilityPanel />);
    unmount();

    rejectGet(new Error("too late"));
    await Promise.resolve();
    await Promise.resolve();
  });

  it("toggles a previously-marked day off", async () => {
    const day15 = `${currentYear}-${String(currentMonth).padStart(2, "0")}-15`;
    vi.mocked(api.get).mockResolvedValue({
      data: { id: "u1", reference_month: currentMonth, reference_year: currentYear, notes: null, dates: [{ date: day15 }] },
    });
    const user = userEvent.setup();
    render(<UnavailabilityPanel />);

    const dayButton = await screen.findByRole("button", { name: `15 de ${monthName(currentMonth)}` });
    expect(dayButton).toHaveAttribute("aria-pressed", "true");

    await user.click(dayButton);
    expect(dayButton).toHaveAttribute("aria-pressed", "false");
    expect(
      await screen.findByText("Nenhum dia marcado — você está disponível todo o mês.")
    ).toBeInTheDocument();
  });

  it("switches the reference month via the select", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null });
    const user = userEvent.setup();
    render(<UnavailabilityPanel />);

    await screen.findByText("Nenhum dia marcado — você está disponível todo o mês.");
    const select = screen.getByLabelText("Mês de referência") as HTMLSelectElement;
    await user.selectOptions(select, "1");

    await waitFor(() => expect(select.value).toBe("1"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("uses the plural form when more than one day is marked", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null });
    const user = userEvent.setup();
    render(<UnavailabilityPanel />);

    await screen.findByText("Nenhum dia marcado — você está disponível todo o mês.");
    await user.click(screen.getByRole("button", { name: `10 de ${monthName(currentMonth)}` }));
    await user.click(screen.getByRole("button", { name: `11 de ${monthName(currentMonth)}` }));

    expect(await screen.findByText("2 dias marcados.")).toBeInTheDocument();
  });

  it("updates and clears the notes field, resetting the saved flag", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<UnavailabilityPanel />);

    await screen.findByText("Nenhum dia marcado — você está disponível todo o mês.");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Indisponibilidades salvas.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Observação (opcional)"), "Viagem");
    expect(screen.queryByText("Indisponibilidades salvas.")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Viagem")).toBeInTheDocument();
  });
});

function monthName(month: number): string {
  const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return MONTHS[month - 1];
}
