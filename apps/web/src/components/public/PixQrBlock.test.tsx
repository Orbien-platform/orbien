import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PixQrBlock } from "./PixQrBlock";

const props = {
  qrCodeImage: "iVBORw0KGgo=",
  qrCode: "00020126580014br.gov.bcb.pix",
  amount: 50,
  expiresAt: "2026-10-04T15:30:00Z",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PixQrBlock", () => {
  it("mostra o valor em reais em destaque", () => {
    render(<PixQrBlock {...props} amount={1234.5} />);

    // 2 ocorrências: o valor em destaque e o texto alternativo da imagem.
    expect(screen.getByText("R$ 1.234,50")).toBeInTheDocument();
  });

  it("monta a imagem do QR como data URI PNG, com texto alternativo com o valor", () => {
    render(<PixQrBlock {...props} />);

    // `toLocaleString` separa "R$" do número com espaço sem quebra.
    const img = screen.getByRole("img", { name: /^QR Code do PIX de R\$\s50,00$/ });
    expect(img).toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
  });

  it("o QR fica sobre fundo branco, mesmo no tema escuro", () => {
    render(<PixQrBlock {...props} />);

    expect(screen.getByRole("img")).toHaveClass("bg-white");
  });

  it("mostra a validade em horário de Brasília", () => {
    render(<PixQrBlock {...props} />);

    // 15:30 UTC = 12:30 em Brasília.
    expect(screen.getByText(/Válido até 04\/10,? 12:30/)).toBeInTheDocument();
  });

  it("mostra o copia e cola, somente leitura", () => {
    render(<PixQrBlock {...props} />);

    const input = screen.getByLabelText("PIX copia e cola");
    expect(input).toHaveValue("00020126580014br.gov.bcb.pix");
    expect(input).toHaveAttribute("readonly");
  });

  it("copiar manda o código para a área de transferência e confirma, voltando depois de 2s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<PixQrBlock {...props} />);

    await user.click(screen.getByRole("button", { name: /copiar/i }));

    expect(writeText).toHaveBeenCalledWith("00020126580014br.gov.bcb.pix");
    expect(await screen.findByRole("button", { name: /copiado/i })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);
    expect(await screen.findByRole("button", { name: /^copiar$/i })).toBeInTheDocument();
  });

  it("sem permissão de área de transferência, seleciona o código e não mostra 'Copiado'", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("negado"));
    render(<PixQrBlock {...props} />);
    const input = screen.getByLabelText("PIX copia e cola") as HTMLInputElement;
    const select = vi.spyOn(input, "select");

    await user.click(screen.getByRole("button", { name: /copiar/i }));

    expect(select).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /copiado/i })).not.toBeInTheDocument();
  });

  it("focar o campo seleciona o código inteiro", async () => {
    const user = userEvent.setup();
    render(<PixQrBlock {...props} />);
    const input = screen.getByLabelText("PIX copia e cola") as HTMLInputElement;
    const select = vi.spyOn(input, "select");

    await user.click(input);

    expect(select).toHaveBeenCalled();
  });
});
