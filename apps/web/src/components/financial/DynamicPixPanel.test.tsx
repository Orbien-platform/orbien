import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DynamicPixPanel } from "./DynamicPixPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

const pix = {
  payment_id: "pp1",
  qr_code: "00020126580014br.gov.bcb.pix0136abc",
  qr_code_image: "iVBORw0KGgo=",
  amount: 50,
  expires_at: "2026-09-30T23:00:00Z",
};

async function typeAmount(user: ReturnType<typeof userEvent.setup>, digits: string) {
  await user.type(screen.getByLabelText("Valor"), digits);
}

describe("DynamicPixPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa valor zero sem chamar a API", async () => {
    const user = userEvent.setup();
    render(<DynamicPixPanel />);
    await user.click(screen.getByRole("button", { name: "Gerar QR Code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um valor maior que zero.");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("gera o QR, monta a data URI e mostra o copia e cola", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: pix });
    const user = userEvent.setup();
    render(<DynamicPixPanel />);

    await typeAmount(user, "5000");
    await user.click(screen.getByRole("button", { name: "Gerar QR Code" }));

    const img = await screen.findByRole("img", { name: /QR Code do PIX de R\$\s?50,00/ });
    expect(img).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
    expect(screen.getByLabelText("Copia e cola")).toHaveValue(pix.qr_code);
    expect(api.post).toHaveBeenCalledWith("/financial/pix/dynamic", { amount: 50 });
  });

  it("copia o código para a área de transferência", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: pix });
    const user = userEvent.setup();
    render(<DynamicPixPanel />);
    await typeAmount(user, "5000");
    await user.click(screen.getByRole("button", { name: "Gerar QR Code" }));

    await user.click(await screen.findByRole("button", { name: "Copiar código" }));

    expect(await screen.findByRole("button", { name: "Copiado" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(pix.qr_code);
  });

  it("volta ao formulário em Nova cobrança", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: pix });
    const user = userEvent.setup();
    render(<DynamicPixPanel />);
    await typeAmount(user, "5000");
    await user.click(screen.getByRole("button", { name: "Gerar QR Code" }));
    await user.click(await screen.findByRole("button", { name: "Nova cobrança" }));
    expect(screen.getByRole("button", { name: "Gerar QR Code" })).toBeInTheDocument();
  });

  it("mostra a mensagem da API em 4xx (ex.: sem chave PIX)", async () => {
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "Igreja não configurou chave PIX" } },
    });
    const user = userEvent.setup();
    render(<DynamicPixPanel />);
    await typeAmount(user, "5000");
    await user.click(screen.getByRole("button", { name: "Gerar QR Code" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Igreja não configurou chave PIX"),
    );
  });

  it("mostra texto genérico em 5xx (Asaas fora)", async () => {
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 503, data: { message: "Serviço PIX indisponível" } },
    });
    const user = userEvent.setup();
    render(<DynamicPixPanel />);
    await typeAmount(user, "5000");
    await user.click(screen.getByRole("button", { name: "Gerar QR Code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível gerar o QR. Tente de novo.");
  });

  it("mostra sem acesso no 403", async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { status: 403 } });
    const user = userEvent.setup();
    render(<DynamicPixPanel />);
    await typeAmount(user, "5000");
    await user.click(screen.getByRole("button", { name: "Gerar QR Code" }));
    expect(await screen.findByText(/Você não tem acesso a PIX com QR Code/)).toBeInTheDocument();
  });
});
