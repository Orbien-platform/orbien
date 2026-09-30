import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { EventRegistrationPanel } from "./EventRegistrationPanel";

vi.mock("@/lib/api", () => ({
  isForbidden: () => false,
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const mockedApi = vi.mocked(api, true);

const SUMMARY_URL = "/content/posts/p1/registrations/summary";
const ME_URL = "/content/posts/p1/registrations/me";

function summary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    registration_enabled: true,
    registration_limit: null,
    registration_deadline: null,
    registrations_closed: false,
    confirmed_count: 0,
    waitlisted_count: 0,
    seats_left: null,
    registration_price: null,
    ...overrides,
  };
}

function httpError(status: number, message?: string) {
  return Object.assign(new Error("http"), {
    isAxiosError: true,
    response: { status, data: message ? { message } : {} },
  });
}

/** Responde `summary` e `me`; `me` vazio é o `null` do Nest (200 de corpo vazio). */
function respond(opts: { summary?: Record<string, unknown>; mine?: unknown } = {}) {
  mockedApi.get.mockImplementation((url: string) => {
    if (url === SUMMARY_URL) return Promise.resolve({ data: summary(opts.summary) });
    if (url === ME_URL) return Promise.resolve({ data: opts.mine ?? "" });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// `userEvent.setup()` instala o próprio stub de `navigator.clipboard`; o mock
// tem que entrar depois dele.
function mockClipboard(writeText: () => Promise<void>) {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: spy }, configurable: true });
  return spy;
}

describe("EventRegistrationPanel", () => {
  it("nunca chama a lista do organizador", async () => {
    respond();
    render(<EventRegistrationPanel postId="p1" />);
    await screen.findByText("Inscrição gratuita");
    const urls = mockedApi.get.mock.calls.map(([url]) => url);
    expect(urls.sort()).toEqual([ME_URL, SUMMARY_URL]);
  });

  it("evento gratuito: inscreve e mostra a inscrição confirmada", async () => {
    respond();
    mockedApi.post.mockResolvedValue({ data: { id: "r1", status: "confirmed" } });
    const user = userEvent.setup();
    render(<EventRegistrationPanel postId="p1" />);

    await user.click(await screen.findByRole("button", { name: "Inscrever-se" }));

    expect(mockedApi.post).toHaveBeenCalledWith(ME_URL);
    expect(await screen.findByText("Inscrição confirmada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar inscrição" })).toBeInTheDocument();
  });

  it("mostra vagas restantes (singular e plural) e o prazo", async () => {
    respond({ summary: { seats_left: 1, registration_deadline: "2026-10-01T15:00:00.000Z" } });
    render(<EventRegistrationPanel postId="p1" />);
    expect(await screen.findByText("1 vaga restante")).toBeInTheDocument();
    expect(screen.getByText(/Inscrições até 01\/10\/2026, 12:00/)).toBeInTheDocument();
  });

  it("vagas no plural", async () => {
    respond({ summary: { seats_left: 5 } });
    render(<EventRegistrationPanel postId="p1" />);
    expect(await screen.findByText("5 vagas restantes")).toBeInTheDocument();
  });

  it("gratuito lotado oferece a fila de espera", async () => {
    respond({ summary: { seats_left: 0 } });
    mockedApi.post.mockResolvedValue({ data: { id: "r1", status: "waitlisted" } });
    const user = userEvent.setup();
    render(<EventRegistrationPanel postId="p1" />);

    expect(await screen.findByText("Vagas esgotadas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entrar na fila de espera" }));

    expect(await screen.findByText("Na fila de espera")).toBeInTheDocument();
  });

  it("pago lotado não oferece botão nenhum", async () => {
    respond({ summary: { seats_left: 0, registration_price: 50 } });
    render(<EventRegistrationPanel postId="p1" />);
    expect(await screen.findByText("As vagas para este evento acabaram.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inscrever|fila/ })).not.toBeInTheDocument();
  });

  it("prazo vencido esconde Inscrever-se mas mantém Cancelar", async () => {
    respond({
      summary: { registrations_closed: true, registration_deadline: "2026-10-01T15:00:00.000Z" },
      mine: { id: "r1", status: "confirmed" },
    });
    render(<EventRegistrationPanel postId="p1" />);

    expect(await screen.findByText(/Inscrições encerradas em/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar inscrição" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inscrever-se" })).not.toBeInTheDocument();
  });

  it("prazo vencido sem inscrição: avisa que encerrou", async () => {
    respond({ summary: { registrations_closed: true } });
    render(<EventRegistrationPanel postId="p1" />);
    expect(
      await screen.findByText("As inscrições para este evento estão encerradas.")
    ).toBeInTheDocument();
  });

  it("evento pago: mostra preço, QR e copia-e-cola devolvidos pelo POST", async () => {
    respond({ summary: { registration_price: 25.5 } });
    mockedApi.post.mockResolvedValue({
      data: {
        registration: { id: "r1", status: "pending_payment" },
        payment: { qr_code: "00020126PIXCODE", qr_code_image: "QUJD" },
      },
    });
    const user = userEvent.setup();
    const writeText = mockClipboard(() => Promise.resolve());
    render(<EventRegistrationPanel postId="p1" />);

    expect(await screen.findByText(/R\$\s?25,50/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inscrever-se" }));

    expect(await screen.findByText("Aguardando pagamento")).toBeInTheDocument();
    expect(screen.getByAltText(/QR Code do PIX/)).toHaveAttribute(
      "src",
      "data:image/png;base64,QUJD"
    );
    expect(screen.getByTestId("pix-code")).toHaveTextContent("00020126PIXCODE");
    expect(screen.getByText(/vale por 24 horas e só aparece aqui agora/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copiar código PIX" }));
    expect(writeText).toHaveBeenCalledWith("00020126PIXCODE");
    expect(await screen.findByRole("button", { name: "Código copiado" })).toBeInTheDocument();
  });

  it("falha ao copiar avisa e mantém o código em tela", async () => {
    respond({ summary: { registration_price: 10 } });
    mockedApi.post.mockResolvedValue({
      data: {
        registration: { id: "r1", status: "pending_payment" },
        payment: { qr_code: "PIX", qr_code_image: "QUJD" },
      },
    });
    const user = userEvent.setup();
    mockClipboard(() => Promise.reject(new Error("denied")));
    render(<EventRegistrationPanel postId="p1" />);

    await user.click(await screen.findByRole("button", { name: "Inscrever-se" }));
    await user.click(await screen.findByRole("button", { name: "Copiar código PIX" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível copiar");
    expect(screen.getByTestId("pix-code")).toBeInTheDocument();
  });

  it("inscrição pendente vinda do GET (sem QR) mostra o estado e permite cancelar", async () => {
    respond({
      summary: { registration_price: 10 },
      mine: { id: "r1", status: "pending_payment" },
    });
    render(<EventRegistrationPanel postId="p1" />);

    expect(await screen.findByText("Aguardando pagamento")).toBeInTheDocument();
    expect(screen.queryByAltText(/QR Code do PIX/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar inscrição" })).toBeInTheDocument();
  });

  it("cancelar volta ao botão de inscrever-se, limpa o QR e recarrega as vagas", async () => {
    respond({ summary: { registration_price: 10 } });
    mockedApi.post.mockResolvedValue({
      data: {
        registration: { id: "r1", status: "pending_payment" },
        payment: { qr_code: "PIX", qr_code_image: "QUJD" },
      },
    });
    mockedApi.delete.mockResolvedValue({ data: { id: "r1", status: "cancelled" } });
    const user = userEvent.setup();
    render(<EventRegistrationPanel postId="p1" />);

    await user.click(await screen.findByRole("button", { name: "Inscrever-se" }));
    await screen.findByTestId("pix-code");
    const before = mockedApi.get.mock.calls.filter(([u]) => u === SUMMARY_URL).length;

    await user.click(screen.getByRole("button", { name: "Cancelar inscrição" }));

    expect(mockedApi.delete).toHaveBeenCalledWith(ME_URL);
    expect(await screen.findByRole("button", { name: "Inscrever-se" })).toBeInTheDocument();
    expect(screen.queryByTestId("pix-code")).not.toBeInTheDocument();
    expect(mockedApi.get.mock.calls.filter(([u]) => u === SUMMARY_URL).length).toBeGreaterThan(before);
  });

  it("erro 4xx mostra a mensagem da API; 5xx cai no texto genérico", async () => {
    respond();
    mockedApi.post
      .mockRejectedValueOnce(httpError(400, "Vagas esgotadas para este evento"))
      .mockRejectedValueOnce(httpError(502, "Serviço PIX indisponível"));
    const user = userEvent.setup();
    render(<EventRegistrationPanel postId="p1" />);

    await user.click(await screen.findByRole("button", { name: "Inscrever-se" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Vagas esgotadas para este evento");

    await user.click(screen.getByRole("button", { name: "Inscrever-se" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível concluir. Tente novamente.")
    );
  });

  it("erro ao cancelar mostra a mensagem e mantém a inscrição", async () => {
    respond({ mine: { id: "r1", status: "confirmed" } });
    mockedApi.delete.mockRejectedValue(httpError(500));
    const user = userEvent.setup();
    render(<EventRegistrationPanel postId="p1" />);

    await user.click(await screen.findByRole("button", { name: "Cancelar inscrição" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível concluir");
    expect(screen.getByText("Inscrição confirmada")).toBeInTheDocument();
  });

  it("clique duplo dispara um único POST (duas cobranças de PIX custam caro)", async () => {
    respond();
    let resolve!: (v: unknown) => void;
    mockedApi.post.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<EventRegistrationPanel postId="p1" />);

    const button = await screen.findByRole("button", { name: "Inscrever-se" });
    await user.dblClick(button);
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    resolve({ data: { id: "r1", status: "confirmed" } });
    await screen.findByText("Inscrição confirmada");
  });

  it("inscrição desligada e sem inscrição do usuário: não renderiza nada", async () => {
    respond({ summary: { registration_enabled: false } });
    const { container } = render(<EventRegistrationPanel postId="p1" />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("inscrição desligada mas com inscrição do usuário: ainda permite cancelar", async () => {
    respond({
      summary: { registration_enabled: false },
      mine: { id: "r1", status: "confirmed" },
    });
    render(<EventRegistrationPanel postId="p1" />);
    expect(await screen.findByRole("button", { name: "Cancelar inscrição" })).toBeInTheDocument();
  });

  it("falha em .../me não derruba o resumo", async () => {
    mockedApi.get.mockImplementation((url: string) =>
      url === SUMMARY_URL
        ? Promise.resolve({ data: summary() })
        : Promise.reject(httpError(500))
    );
    render(<EventRegistrationPanel postId="p1" />);
    expect(await screen.findByRole("button", { name: "Inscrever-se" })).toBeInTheDocument();
  });

  it("falha no resumo mostra o erro e permite tentar de novo", async () => {
    mockedApi.get.mockRejectedValueOnce(httpError(500)).mockRejectedValueOnce(httpError(500));
    const user = userEvent.setup();
    render(<EventRegistrationPanel postId="p1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as inscrições."
    );

    respond();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("button", { name: "Inscrever-se" })).toBeInTheDocument();
  });

  it("a releitura das vagas que falha depois de inscrever não apaga o que já está em tela", async () => {
    respond({ summary: { seats_left: 3 } });
    mockedApi.post.mockResolvedValue({ data: { id: "r1", status: "confirmed" } });
    const user = userEvent.setup();
    render(<EventRegistrationPanel postId="p1" />);

    await user.click(await screen.findByRole("button", { name: "Inscrever-se" }));
    mockedApi.get.mockRejectedValue(httpError(500));
    // O clique já aconteceu; a releitura falha só na próxima ação.
    expect(await screen.findByText("Inscrição confirmada")).toBeInTheDocument();
    mockedApi.delete.mockResolvedValue({ data: {} });
    await user.click(screen.getByRole("button", { name: "Cancelar inscrição" }));
    expect(await screen.findByText("3 vagas restantes")).toBeInTheDocument();
  });

  it("desmontar no meio da carga não atualiza o estado", async () => {
    respond();
    const { unmount } = render(<EventRegistrationPanel postId="p1" />);
    unmount();
    await Promise.resolve();
    expect(mockedApi.get).toHaveBeenCalledTimes(2);
  });
});
