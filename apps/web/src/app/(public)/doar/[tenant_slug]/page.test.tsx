import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useParams } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DoarPage from "./page";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
}));

const mockedUseParams = vi.mocked(useParams);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseParams.mockReturnValue({ tenant_slug: "doca-church" });
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DoarPage", () => {
  it("desabilita o botão enquanto o valor está zerado", () => {
    render(<DoarPage />);
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("envia a doação com o tenant_slug da rota e mostra a chave PIX", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        pix_key: "doca@pix.com",
        amount: 50,
        church_name: "Doca Church",
        transaction_ref: "PIX-abc123",
      },
    });

    const user = userEvent.setup();
    render(<DoarPage />);

    await user.type(screen.getByLabelText("Valor"), "5000");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(await screen.findByDisplayValue("doca@pix.com")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/financial/pix/public-donation", {
      tenant_slug: "doca-church",
      amount: 50,
      donor_name: undefined,
      donor_email: undefined,
      website: undefined,
    });
  });

  it("mostra mensagem específica quando a igreja não é encontrada", async () => {
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });

    const user = userEvent.setup();
    render(<DoarPage />);

    await user.type(screen.getByLabelText("Valor"), "1000");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(await screen.findByText(/igreja não encontrada/i)).toBeInTheDocument();
  });

  it("repassa a mensagem do servidor em outros erros 4xx", async () => {
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "Igreja não configurou chave PIX" } },
    });

    const user = userEvent.setup();
    render(<DoarPage />);

    await user.type(screen.getByLabelText("Valor"), "1000");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(
      await screen.findByText("Igreja não configurou chave PIX")
    ).toBeInTheDocument();
  });
});
