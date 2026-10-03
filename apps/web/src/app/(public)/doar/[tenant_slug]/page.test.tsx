import { act, fireEvent, render, screen } from "@testing-library/react";
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
  default: { post: vi.fn(), get: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
}));

const mockedUseParams = vi.mocked(useParams);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
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

function dynamicResult(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      mode: "dynamic",
      pix_key: "doca@pix.com",
      amount: 50,
      church_name: "Doca Church",
      transaction_ref: "PIX-ABC12345",
      payment_id: "8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11",
      qr_code: "00020126580014br.gov.bcb.pix",
      qr_code_image: "iVBORw0KGgo=",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ...overrides,
    },
  };
}

const STORAGE_KEY = "orbien:doar:doca-church";

async function submitFifty() {
  fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "50,00" } });
  fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
}

describe("DoarPage — igreja Premium: QR dinâmico", () => {
  it("mostra o QR, o valor, o copia e cola e que está aguardando o pagamento", async () => {
    vi.mocked(api.post).mockResolvedValue(dynamicResult());
    render(<DoarPage />);

    await submitFifty();

    expect(await screen.findByRole("img", { name: /QR Code do PIX/ })).toHaveAttribute(
      "src",
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(screen.getByLabelText("PIX copia e cola")).toHaveValue("00020126580014br.gov.bcb.pix");
    expect(screen.getByText("Aguardando o pagamento")).toBeInTheDocument();
    expect(screen.getByText("Pague com o QR code")).toBeInTheDocument();
    expect(screen.getByText("Referência: PIX-ABC12345")).toBeInTheDocument();
    // Não é a tela da chave estática.
    expect(screen.queryByText(/registrada/)).not.toBeInTheDocument();
  });

  it("a chave PIX continua disponível como alternativa, recolhida", async () => {
    vi.mocked(api.post).mockResolvedValue(dynamicResult());
    render(<DoarPage />);

    await submitFifty();

    await screen.findByRole("img", { name: /QR Code do PIX/ });
    expect(screen.getByText("Prefere copiar a chave PIX?")).toBeInTheDocument();
    expect(screen.getByLabelText("Chave PIX")).toHaveValue("doca@pix.com");
  });

  it("guarda o QR na sessão para sobreviver a um recarregamento", async () => {
    vi.mocked(api.post).mockResolvedValue(dynamicResult());
    render(<DoarPage />);

    await submitFifty();

    await screen.findByRole("img", { name: /QR Code do PIX/ });
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      mode: "dynamic",
      payment_id: "8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11",
    });
  });

  it("a chave estática não é guardada na sessão", async () => {
    vi.mocked(api.post).mockResolvedValue(successResult());
    render(<DoarPage />);

    await submitFifty();

    await screen.findByDisplayValue("doca@pix.com");
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("quando o servidor confirma, troca para 'recebida', para o QR e limpa a sessão", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.post).mockResolvedValue(dynamicResult());
      vi.mocked(api.get).mockResolvedValue({ data: { status: "confirmed" } });
      render(<DoarPage />);

      await submitFifty();
      await screen.findByRole("img", { name: /QR Code do PIX/ });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      expect(await screen.findByText(/Recebemos sua doação de/)).toBeInTheDocument();
      expect(screen.getByText("Doação recebida")).toBeInTheDocument();
      expect(screen.queryByRole("img", { name: /QR Code do PIX/ })).not.toBeInTheDocument();
      expect(api.get).toHaveBeenCalledWith(
        "/financial/pix/public-donation/doca-church/8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11",
      );
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("'Fazer outra doação' volta ao formulário com o valor zerado", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.post).mockResolvedValue(dynamicResult());
      vi.mocked(api.get).mockResolvedValue({ data: { status: "confirmed" } });
      render(<DoarPage />);
      await submitFifty();
      await screen.findByRole("img", { name: /QR Code do PIX/ });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      fireEvent.click(await screen.findByRole("button", { name: /fazer outra doação/i }));

      expect(screen.getByLabelText("Valor")).toHaveValue("");
      expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("QR vencido: explica, e 'Gerar novo QR code' volta ao formulário com o MESMO valor", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.post).mockResolvedValue(dynamicResult());
      vi.mocked(api.get).mockResolvedValue({ data: { status: "expired" } });
      render(<DoarPage />);
      await submitFifty();
      await screen.findByRole("img", { name: /QR Code do PIX/ });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      expect(await screen.findByText(/passou da validade/)).toBeInTheDocument();
      expect(screen.getByText("O QR code venceu")).toBeInTheDocument();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /gerar novo qr code/i }));

      expect(screen.getByLabelText("Valor")).toHaveValue("50,00");
      expect(screen.getByRole("button", { name: /continuar/i })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("DoarPage — retomada do QR depois de recarregar", () => {
  it("volta ao QR guardado, sem criar outra cobrança", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(dynamicResult().data));

    render(<DoarPage />);

    expect(await screen.findByRole("img", { name: /QR Code do PIX/ })).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("QR guardado e já vencido é descartado: formulário limpo", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(dynamicResult({ expires_at: new Date(Date.now() - 1000).toISOString() }).data),
    );

    render(<DoarPage />);

    expect(await screen.findByLabelText("Valor")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR Code do PIX/ })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each([
    ["JSON quebrado", "{nao-e-json"],
    ["chave estática", JSON.stringify({ ...dynamicResult().data, mode: "static" })],
    ["sem payment_id", JSON.stringify({ ...dynamicResult().data, payment_id: undefined })],
    ["sem validade", JSON.stringify({ ...dynamicResult().data, expires_at: undefined })],
  ])("guardado com %s é ignorado", async (_nome, raw) => {
    sessionStorage.setItem(STORAGE_KEY, raw);

    render(<DoarPage />);

    expect(await screen.findByLabelText("Valor")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR Code do PIX/ })).not.toBeInTheDocument();
  });

  it("storage bloqueado (leitura, escrita e remoção lançam): a doação funciona do mesmo jeito", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.mocked(api.post).mockResolvedValue(dynamicResult());
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(api.get).mockResolvedValue({ data: { status: "confirmed" } });
      render(<DoarPage />);

      await submitFifty();
      expect(await screen.findByRole("img", { name: /QR Code do PIX/ })).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      expect(await screen.findByText(/Recebemos sua doação/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /fazer outra doação/i }));
      expect(screen.getByLabelText("Valor")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});

describe("DoarPage — Premium sem QR (fallback) e erros", () => {
  it("fallback para a chave: avisa que o QR não está disponível e mostra valor e chave", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { ...successResult().data, mode: "static", fallback_reason: "provider_unavailable" },
    });
    render(<DoarPage />);

    await submitFifty();

    expect(await screen.findByText(/O QR code não está disponível agora/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("doca@pix.com")).toBeInTheDocument();
    expect(screen.getByText(/Valor: R\$\s50,00/)).toBeInTheDocument();
    expect(screen.queryByText(/registrada/)).not.toBeInTheDocument();
  });

  it("429 vira uma mensagem de espera, não o texto do servidor", async () => {
    vi.mocked(api.post).mockRejectedValue({ isAxiosError: true, response: { status: 429 } });
    render(<DoarPage />);

    await submitFifty();

    expect(await screen.findByText(/Muitas tentativas seguidas/)).toBeInTheDocument();
  });

  it("erro de servidor mostra a mensagem padrão e deixa tentar de novo", async () => {
    vi.mocked(api.post).mockRejectedValue({ isAxiosError: true, response: { status: 500 } });
    render(<DoarPage />);

    await submitFifty();

    expect(
      await screen.findByText("Não foi possível gerar a doação agora. Tente novamente."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuar/i })).toBeEnabled();
  });
});

describe("DoarPage — limites de valor", () => {
  it("abaixo de R$ 5,00: avisa o mínimo e não deixa continuar", () => {
    render(<DoarPage />);

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "4,99" } });

    expect(screen.getByRole("alert")).toHaveTextContent(/O valor mínimo é R\$\s5,00/);
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("acima de R$ 50.000,00: avisa o máximo e não deixa continuar", () => {
    render(<DoarPage />);

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "50000,01" } });

    expect(screen.getByRole("alert")).toHaveTextContent(/O valor máximo é R\$\s50\.000,00/);
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("os extremos exatos, R$ 5,00 e R$ 50.000,00, são aceitos", () => {
    render(<DoarPage />);

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "5,00" } });
    expect(screen.getByRole("button", { name: /continuar/i })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "50000,00" } });
    expect(screen.getByRole("button", { name: /continuar/i })).toBeEnabled();
  });

  it("valor fora do intervalo não envia nem por submit direto do formulário", () => {
    render(<DoarPage />);
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "4,00" } });

    const form = screen.getByRole("button", { name: /continuar/i }).closest("form")!;
    fireEvent.submit(form);

    expect(api.post).not.toHaveBeenCalled();
  });
});
