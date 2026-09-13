import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useParams } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DoarPage from "./page";
import api from "@/lib/api";

function successResult() {
  return {
    data: {
      pix_key: "doca@pix.com",
      amount: 50,
      church_name: "Doca Church",
      transaction_ref: "PIX-abc123",
    },
  };
}

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

  it("não envia quando o valor está zerado (submit via form)", () => {
    render(<DoarPage />);
    const form = screen.getByRole("button", { name: /continuar/i }).closest("form")!;
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("envia a doação com o tenant_slug da rota e mostra a chave PIX", async () => {
    vi.mocked(api.post).mockResolvedValue(successResult());

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

  it("envia nome e e-mail do doador quando preenchidos", async () => {
    vi.mocked(api.post).mockResolvedValue(successResult());

    const user = userEvent.setup();
    render(<DoarPage />);

    await user.type(screen.getByLabelText("Valor"), "1000");
    await user.type(screen.getByLabelText("Seu nome (opcional)"), "Ana Silva");
    await user.type(screen.getByLabelText("E-mail (opcional)"), "ana@igreja.com");
    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(await screen.findByDisplayValue("doca@pix.com")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/financial/pix/public-donation", {
      tenant_slug: "doca-church",
      amount: 10,
      donor_name: "Ana Silva",
      donor_email: "ana@igreja.com",
      website: undefined,
    });
  });

  it("repassa o valor do honeypot quando preenchido (indício de bot)", async () => {
    vi.mocked(api.post).mockResolvedValue(successResult());
    const { container } = render(<DoarPage />);

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "10,00" } });
    const honeypot = container.querySelector('input[name="website"]')!;
    fireEvent.change(honeypot, { target: { value: "http://spam.example" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    await screen.findByDisplayValue("doca@pix.com");
    expect(api.post).toHaveBeenCalledWith(
      "/financial/pix/public-donation",
      expect.objectContaining({ website: "http://spam.example" })
    );
  });

  it("copia a chave PIX e volta ao rótulo original após 2s", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api.post).mockResolvedValue(successResult());
      render(<DoarPage />);

      fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "50,00" } });
      fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
      await vi.waitFor(() => screen.getByDisplayValue("doca@pix.com"), { timeout: 5000 });

      fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
      await vi.waitFor(
        () => expect(screen.getByRole("button", { name: /copiado/i })).toBeInTheDocument(),
        { timeout: 5000 }
      );
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("doca@pix.com");

      vi.advanceTimersByTime(2000);
      await vi.waitFor(
        () => expect(screen.getByRole("button", { name: /^copiar$/i })).toBeInTheDocument(),
        { timeout: 5000 }
      );
    } finally {
      vi.useRealTimers();
    }
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
