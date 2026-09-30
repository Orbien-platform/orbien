import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DonationReceiptsPanel } from "./DonationReceiptsPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

function receipt(i: number, name = `Doador ${i}`) {
  return {
    id: `r${i}`,
    generated_at: "2026-09-10T15:00:00Z",
    person_name: name,
    amount: "150.00",
    occurred_at: "2026-09-10T14:00:00Z",
  };
}

describe("DonationReceiptsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista os recibos com valor formatado", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [receipt(1, "Maria")], total: 1 } });
    render(<DonationReceiptsPanel />);

    expect(await screen.findByText("Maria")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?150,00/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/financial/donation-receipts?page=1&page_size=20");
  });

  it("mostra o estado vazio", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0 } });
    render(<DonationReceiptsPanel />);
    expect(await screen.findByText("Nenhum recibo emitido ainda.")).toBeInTheDocument();
  });

  it("pede o link assinado no clique e abre em nova aba", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: [receipt(1, "Maria")], total: 1 } })
      .mockResolvedValueOnce({ data: { download_url: "https://r2.test/recibo.pdf?sig=abc", expires_in: 3600 } });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    render(<DonationReceiptsPanel />);

    await user.click(await screen.findByRole("button", { name: "Baixar recibo de Maria" }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith("https://r2.test/recibo.pdf?sig=abc", "_blank", "noopener,noreferrer"),
    );
    expect(api.get).toHaveBeenLastCalledWith("/financial/donation-receipts/r1/download");
    open.mockRestore();
  });

  it("avisa quando o link não sai e não abre aba", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: [receipt(1, "Maria")], total: 1 } })
      .mockRejectedValueOnce(new Error("r2 fora"));
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    render(<DonationReceiptsPanel />);

    await user.click(await screen.findByRole("button", { name: "Baixar recibo de Maria" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gerar o link do recibo");
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("pagina quando passa de 20 recibos", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { data: [receipt(1)], total: 45 } })
      .mockResolvedValueOnce({ data: { data: [receipt(21)], total: 45 } });
    const user = userEvent.setup();
    render(<DonationReceiptsPanel />);

    expect(await screen.findByText("Página 1 de 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));

    expect(await screen.findByText("Doador 21")).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith("/financial/donation-receipts?page=2&page_size=20");
  });

  it("mostra sem acesso no 403", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });
    render(<DonationReceiptsPanel />);
    expect(await screen.findByText(/Você não tem acesso a Recibos de doação/)).toBeInTheDocument();
  });

  it("mostra erro de carga com tentar de novo", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));
    render(<DonationReceiptsPanel />);
    expect(await screen.findByText("Erro ao carregar os recibos.")).toBeInTheDocument();
  });
});
