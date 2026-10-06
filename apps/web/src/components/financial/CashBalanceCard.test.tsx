import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CashBalanceCard } from "./CashBalanceCard";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

const URL_OCT = "/financial/dashboard/cash-balance?as_of=2026-10-31";

function cash(balance: number, pending = { income: 0, expense: 0 }) {
  return { data: { as_of: "2026-10-31", balance, pending } };
}

describe("CashBalanceCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra skeleton enquanto carrega", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    render(<CashBalanceCard asOf="2026-10-31" />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("pede o caixa na data de corte e rotula com a data", async () => {
    vi.mocked(api.get).mockResolvedValue(cash(1234.5));
    render(<CashBalanceCard asOf="2026-10-31" />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(URL_OCT));
    expect(await screen.findByText("Caixa em 31/10/2026")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?1\.234,50/)).toBeInTheDocument();
  });

  it("caixa negativo aparece com sinal e em tom de saída", async () => {
    vi.mocked(api.get).mockResolvedValue(cash(-150));
    render(<CashBalanceCard asOf="2026-10-31" />);

    const value = await screen.findByText(/-\s?R\$\s?150,00/);
    expect(value).toHaveClass("text-crimson");
  });

  it("caixa positivo aparece em tom de entrada", async () => {
    vi.mocked(api.get).mockResolvedValue(cash(10));
    render(<CashBalanceCard asOf="2026-10-31" />);
    expect(await screen.findByText(/R\$\s?10,00/)).toHaveClass("text-teal");
  });

  it("mostra o que falta receber e pagar até a data, quando há não pagos", async () => {
    vi.mocked(api.get).mockResolvedValue(cash(100, { income: 300, expense: 80 }));
    render(<CashBalanceCard asOf="2026-10-31" />);

    expect(await screen.findByText(/A receber/)).toHaveTextContent(/R\$\s?300,00/);
    expect(screen.getByText(/A pagar/)).toHaveTextContent(/R\$\s?80,00/);
  });

  it("omite a linha de não pagos quando não há nenhum", async () => {
    vi.mocked(api.get).mockResolvedValue(cash(100));
    render(<CashBalanceCard asOf="2026-10-31" />);

    await screen.findByText("Caixa em 31/10/2026");
    expect(screen.queryByText(/A receber/)).not.toBeInTheDocument();
    expect(screen.queryByText(/A pagar/)).not.toBeInTheDocument();
  });

  it("refaz a busca ao trocar a data de corte", async () => {
    vi.mocked(api.get).mockResolvedValue(cash(100));
    const { rerender } = render(<CashBalanceCard asOf="2026-10-31" />);
    await screen.findByText("Caixa em 31/10/2026");

    rerender(<CashBalanceCard asOf="2026-11-30" />);
    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith("/financial/dashboard/cash-balance?as_of=2026-11-30"),
    );
    expect(await screen.findByText("Caixa em 30/11/2026")).toBeInTheDocument();
  });

  it("refaz a busca quando a chave de recarga muda (lançamento criado, pago ou excluído)", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(cash(100)).mockResolvedValueOnce(cash(250));
    const { rerender } = render(<CashBalanceCard asOf="2026-10-31" reloadKey={0} />);
    await screen.findByText(/R\$\s?100,00/);

    rerender(<CashBalanceCard asOf="2026-10-31" reloadKey={1} />);
    expect(await screen.findByText(/R\$\s?250,00/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("descarta a resposta atrasada de uma data que já foi trocada", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    vi.mocked(api.get)
      .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce({ data: { as_of: "2026-11-30", balance: 999, pending: { income: 0, expense: 0 } } });

    const { rerender } = render(<CashBalanceCard asOf="2026-10-31" />);
    rerender(<CashBalanceCard asOf="2026-11-30" />);
    await screen.findByText(/R\$\s?999,00/);

    resolveOld(cash(1));
    await Promise.resolve();
    expect(screen.getByText(/R\$\s?999,00/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s?1,00/)).not.toBeInTheDocument();
  });

  it("não repete a busca na dupla invocação de efeito do StrictMode", async () => {
    vi.mocked(api.get).mockResolvedValue(cash(100));
    render(
      <StrictMode>
        <CashBalanceCard asOf="2026-10-31" />
      </StrictMode>,
    );
    await screen.findByText("Caixa em 31/10/2026");
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("mostra NoAccessState em 403", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });
    render(<CashBalanceCard asOf="2026-10-31" />);
    expect(await screen.findByText(/não inclui esta área/)).toBeInTheDocument();
  });

  it("em erro, explica e deixa tentar de novo", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(cash(100));
    render(<CashBalanceCard asOf="2026-10-31" />);

    expect(await screen.findByText("Erro ao carregar o caixa.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Caixa em 31/10/2026")).toBeInTheDocument();
  });
});
