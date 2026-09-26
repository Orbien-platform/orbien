import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DonationBookletPanel } from "./DonationBookletPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

function donor(overrides?: Partial<Record<string, unknown>>) {
  return {
    person_id: "p1",
    person_name: "Maria Silva",
    total: 3600,
    count: 12,
    ...overrides,
  };
}

const thisYear = new Date().getFullYear();

describe("DonationBookletPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("fetches the current year by default and lists donors", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [donor()] });
    render(<DonationBookletPanel />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(`/financial/donation-receipts/annual/summary?year=${thisYear}`)
    );
    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?3\.600,00/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no identified donors", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    render(<DonationBookletPanel />);

    expect(await screen.findByText("Nenhum doador identificado neste ano.")).toBeInTheDocument();
  });

  it("falls back to an empty list when the response has no data (?? [])", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: undefined });
    render(<DonationBookletPanel />);

    expect(await screen.findByText("Nenhum doador identificado neste ano.")).toBeInTheDocument();
  });

  it("refetches when the year changes", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [donor()] });
    render(<DonationBookletPanel />);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(`/financial/donation-receipts/annual/summary?year=${thisYear}`)
    );

    await user.selectOptions(screen.getByRole("combobox"), String(thisYear - 1));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        `/financial/donation-receipts/annual/summary?year=${thisYear - 1}`
      )
    );
  });

  it("shows NoAccessState on 403 (Starter tenant)", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });
    render(<DonationBookletPanel />);

    expect(await screen.findByText("Você não tem acesso a Carnê do dizimista.")).toBeInTheDocument();
  });

  it("shows a load error with retry (not the empty state) on a non-403 failure", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ data: [donor()] });
    render(<DonationBookletPanel />);

    expect(await screen.findByText("Erro ao carregar os doadores.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum doador identificado neste ano.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();
  });

  it("downloads the PDF named carne-dizimista-{year}.pdf when clicking 'Baixar carnê'", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [donor()] })
      .mockResolvedValueOnce({ data: new Blob(["pdf"]) });
    render(<DonationBookletPanel />);

    await screen.findByText("Maria Silva");
    await user.click(screen.getByRole("button", { name: "Baixar carnê" }));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        `/financial/donation-receipts/annual/p1?year=${thisYear}`,
        { responseType: "blob" }
      )
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("shows an error message when the download fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [donor()] })
      .mockRejectedValueOnce(new Error("fail"));
    render(<DonationBookletPanel />);

    await screen.findByText("Maria Silva");
    await user.click(screen.getByRole("button", { name: "Baixar carnê" }));

    expect(await screen.findByText("Erro ao baixar o carnê.")).toBeInTheDocument();
  });

  it("ignora uma resposta atrasada de um ano anterior (corrida entre requisições)", async () => {
    const user = userEvent.setup();
    let resolveCurrentYear!: (v: { data: unknown }) => void;
    const currentYearPromise = new Promise<{ data: unknown }>((resolve) => {
      resolveCurrentYear = resolve;
    });
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === `/financial/donation-receipts/annual/summary?year=${thisYear}`) return currentYearPromise;
      return Promise.resolve({ data: [donor({ person_id: "p2", person_name: "João" })] });
    });

    render(<DonationBookletPanel />);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(`/financial/donation-receipts/annual/summary?year=${thisYear}`)
    );

    await user.selectOptions(screen.getByRole("combobox"), String(thisYear - 1));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        `/financial/donation-receipts/annual/summary?year=${thisYear - 1}`
      )
    );
    expect(await screen.findByText("João")).toBeInTheDocument();

    resolveCurrentYear({ data: [donor({ person_name: "Maria (atrasada)" })] });
    await Promise.resolve();
    expect(screen.queryByText("Maria (atrasada)")).not.toBeInTheDocument();
  });

  it("ignora um erro atrasado de um ano anterior (corrida entre requisições)", async () => {
    const user = userEvent.setup();
    let rejectCurrentYear!: (err: unknown) => void;
    const currentYearPromise = new Promise((_resolve, reject) => {
      rejectCurrentYear = reject;
    });
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === `/financial/donation-receipts/annual/summary?year=${thisYear}`) return currentYearPromise;
      return Promise.resolve({ data: [donor()] });
    });

    render(<DonationBookletPanel />);
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(`/financial/donation-receipts/annual/summary?year=${thisYear}`)
    );

    await user.selectOptions(screen.getByRole("combobox"), String(thisYear - 1));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        `/financial/donation-receipts/annual/summary?year=${thisYear - 1}`
      )
    );
    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();

    rejectCurrentYear({ response: { status: 403 } });
    await Promise.resolve();
    expect(screen.queryByText("Você não tem acesso a Carnê do dizimista.")).not.toBeInTheDocument();
  });

  it("guarda contra a dupla invocação de efeito do StrictMode ao trocar de ano", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [donor()] });
    render(
      <StrictMode>
        <DonationBookletPanel />
      </StrictMode>
    );

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(`/financial/donation-receipts/annual/summary?year=${thisYear}`)
    );
    expect(
      vi.mocked(api.get).mock.calls.filter(
        ([u]) => u === `/financial/donation-receipts/annual/summary?year=${thisYear}`
      ).length
    ).toBe(1);
  });
});
