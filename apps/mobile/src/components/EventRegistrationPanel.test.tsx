// Testes do EventRegistrationPanel (PROD-25) — a tela de member
// self-service de inscrição em evento.
//
// O que cada bloco protege é uma regra que o backend decidiu e a tela tem
// que refletir sem contradizer: lotado-e-gratuito entra na fila (não
// recusa), lotado-e-pago recusa, cancelar vale mesmo depois do prazo, e o
// QR só existe na resposta do POST.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSetStringAsync = jest.fn();
jest.mock("expo-clipboard", () => ({
  setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args),
}));

const mockGetSummary = jest.fn();
const mockGetMine = jest.fn();
const mockRegister = jest.fn();
const mockCancel = jest.fn();
jest.mock("../lib/content/content-client", () => ({
  getEventRegistrationSummary: (...a: unknown[]) => mockGetSummary(...a),
  getMyEventRegistration: (...a: unknown[]) => mockGetMine(...a),
  registerSelfForEvent: (...a: unknown[]) => mockRegister(...a),
  cancelMyEventRegistration: (...a: unknown[]) => mockCancel(...a),
  isPaidRegistration: (result: Record<string, unknown>) => "payment" in result,
}));

import { HttpError, NetworkError } from "../lib/api/errors";
import { EventRegistrationPanel } from "./EventRegistrationPanel";

const FREE_OPEN = {
  registration_enabled: true,
  registration_limit: 30,
  registration_deadline: "2026-10-01T12:00:00.000Z",
  registrations_closed: false,
  confirmed_count: 5,
  waitlisted_count: 0,
  seats_left: 25,
  registration_price: null,
};

const PAYMENT = {
  payment_id: "pix-1",
  qr_code: "00020126BR.GOV.BCB.PIX",
  qr_code_image: "aGVsbG8=",
  amount: 80,
  expires_at: "2026-09-17T12:00:00.000Z",
};

async function renderPanel() {
  await act(async () => {
    render(<EventRegistrationPanel postId="post-1" />);
  });
}

describe("EventRegistrationPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSummary.mockResolvedValue(FREE_OPEN);
    mockGetMine.mockResolvedValue(null);
  });

  it("evento gratuito com vaga: mostra preço, vagas, prazo e o botão de inscrever", async () => {
    await renderPanel();

    await waitFor(() => expect(screen.getByTestId("event-registration")).toBeTruthy());
    expect(screen.getByTestId("event-registration-price").props.children).toBe(
      "Inscrição gratuita",
    );
    expect(screen.getByTestId("event-registration-seats").props.children).toContain(
      "25 vagas restantes",
    );
    expect(screen.getByTestId("event-registration-deadline")).toBeTruthy();
    expect(screen.getByTestId("event-registration-submit")).toBeTruthy();
  });

  it("uma vaga restante fica no singular", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, seats_left: 1 });

    await renderPanel();

    await waitFor(() => expect(screen.getByText("1 vaga restante")).toBeTruthy());
  });

  it("evento sem limite de vagas não mostra linha de vagas", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, seats_left: null });

    await renderPanel();

    await waitFor(() => expect(screen.getByTestId("event-registration")).toBeTruthy());
    expect(screen.queryByTestId("event-registration-seats")).toBeNull();
  });

  it("inscrever em evento gratuito confirma e troca o botão por 'Cancelar inscrição'", async () => {
    mockRegister.mockResolvedValue({
      id: "r1",
      full_name: "Ana",
      status: "confirmed",
      payment_status: "not_required",
      created_at: "2026-09-16T10:00:00.000Z",
    });

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-submit"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("event-registration-cancel")).toBeTruthy(),
    );
    expect(screen.getByText("Inscrição confirmada")).toBeTruthy();
    expect(screen.queryByTestId("event-registration-submit")).toBeNull();
  });

  it("lotado e gratuito: o botão diz 'Entrar na fila de espera' — a API não recusa", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, seats_left: 0 });

    await renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("event-registration-submit").props.children).toBeTruthy(),
    );
    expect(screen.getByText("Entrar na fila de espera")).toBeTruthy();
    expect(screen.getByTestId("event-registration-seats").props.children).toContain(
      "Vagas esgotadas",
    );
  });

  it("quem ficou na fila vê o status de espera ao abrir a tela", async () => {
    mockGetMine.mockResolvedValue({
      id: "r1",
      full_name: "Ana",
      status: "waitlisted",
      payment_status: "not_required",
      created_at: "2026-09-16T10:00:00.000Z",
    });

    await renderPanel();

    await waitFor(() => expect(screen.getByText("Na fila de espera")).toBeTruthy());
    expect(screen.getByTestId("event-registration-cancel")).toBeTruthy();
  });

  it("lotado e pago: recusa antes do toque, sem botão — não há fila quando se cobra", async () => {
    mockGetSummary.mockResolvedValue({
      ...FREE_OPEN,
      seats_left: 0,
      registration_price: 80,
    });

    await renderPanel();

    await waitFor(() => expect(screen.getByTestId("event-registration-blocked")).toBeTruthy());
    expect(screen.getByTestId("event-registration-blocked").props.children).toBe(
      "As vagas para este evento acabaram.",
    );
    expect(screen.queryByTestId("event-registration-submit")).toBeNull();
  });

  it("inscrições encerradas: sem botão, com a razão em tela", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, registrations_closed: true });

    await renderPanel();

    await waitFor(() => expect(screen.getByTestId("event-registration-blocked")).toBeTruthy());
    expect(screen.getByTestId("event-registration-blocked").props.children).toBe(
      "As inscrições para este evento estão encerradas.",
    );
  });

  it("encerrado mas inscrito: o cancelamento continua disponível — não respeita o prazo", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, registrations_closed: true });
    mockGetMine.mockResolvedValue({
      id: "r1",
      full_name: "Ana",
      status: "confirmed",
      payment_status: "not_required",
      created_at: "2026-09-16T10:00:00.000Z",
    });

    await renderPanel();

    await waitFor(() => expect(screen.getByTestId("event-registration-cancel")).toBeTruthy());
    expect(screen.queryByTestId("event-registration-blocked")).toBeNull();
  });

  it("cancelar volta ao estado de não inscrito", async () => {
    mockGetMine.mockResolvedValue({
      id: "r1",
      full_name: "Ana",
      status: "confirmed",
      payment_status: "not_required",
      created_at: "2026-09-16T10:00:00.000Z",
    });
    mockCancel.mockResolvedValue({ id: "r1", status: "cancelled" });

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-cancel")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-cancel"));
    });

    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());
    expect(mockCancel).toHaveBeenCalledWith("post-1");
  });

  // ─── Evento pago (PROD-24) ────────────────────────────────────────────────

  it("evento pago mostra o preço formatado em BRL", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, registration_price: 49.9 });

    await renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("event-registration-price").props.children).toBe("R$ 49,90"),
    );
  });

  it("inscrever em evento pago mostra o QR, o código copia-e-cola e o status de pendente", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, registration_price: 80 });
    mockRegister.mockResolvedValue({
      registration: {
        id: "r1",
        full_name: "Ana",
        status: "pending_payment",
        payment_status: "pending",
        created_at: "2026-09-16T10:00:00.000Z",
      },
      payment: PAYMENT,
    });

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-submit"));
    });

    await waitFor(() => expect(screen.getByTestId("event-registration-payment")).toBeTruthy());
    expect(screen.getByTestId("event-registration-qr").props.source.uri).toBe(
      "data:image/png;base64,aGVsbG8=",
    );
    expect(screen.getByTestId("event-registration-pix-code").props.children).toBe(
      PAYMENT.qr_code,
    );
    expect(screen.getByText("Aguardando pagamento")).toBeTruthy();
  });

  it("copiar manda o payload do PIX para o clipboard e confirma em tela", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, registration_price: 80 });
    mockRegister.mockResolvedValue({
      registration: { id: "r1", status: "pending_payment" },
      payment: PAYMENT,
    });
    mockSetStringAsync.mockResolvedValue(true);

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-submit"));
    });
    await waitFor(() => expect(screen.getByTestId("event-registration-copy")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-copy"));
    });

    expect(mockSetStringAsync).toHaveBeenCalledWith(PAYMENT.qr_code);
    await waitFor(() => expect(screen.getByText("Código copiado")).toBeTruthy());
  });

  it("falha ao copiar não esconde o código — manda selecionar", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, registration_price: 80 });
    mockRegister.mockResolvedValue({
      registration: { id: "r1", status: "pending_payment" },
      payment: PAYMENT,
    });
    mockSetStringAsync.mockRejectedValue(new Error("sem clipboard"));

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-submit"));
    });
    await waitFor(() => expect(screen.getByTestId("event-registration-copy")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-copy"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("event-registration-action-error").props.children).toBe(
        "Não foi possível copiar. Selecione o código abaixo do QR.",
      ),
    );
    expect(screen.getByTestId("event-registration-pix-code")).toBeTruthy();
  });

  it("pending_payment carregado de uma sessão anterior aparece sem QR", async () => {
    mockGetSummary.mockResolvedValue({ ...FREE_OPEN, registration_price: 80 });
    mockGetMine.mockResolvedValue({
      id: "r1",
      full_name: "Ana",
      status: "pending_payment",
      payment_status: "pending",
      created_at: "2026-09-16T10:00:00.000Z",
    });

    await renderPanel();

    await waitFor(() => expect(screen.getByText("Aguardando pagamento")).toBeTruthy());
    expect(screen.queryByTestId("event-registration-payment")).toBeNull();
    expect(screen.getByTestId("event-registration-cancel")).toBeTruthy();
  });

  // ─── Erros ────────────────────────────────────────────────────────────────

  it("erro ao carregar mostra o aviso e não o formulário", async () => {
    mockGetSummary.mockRejectedValue(new NetworkError());

    await renderPanel();

    await waitFor(() => expect(screen.getByTestId("event-registration-error")).toBeTruthy());
    expect(screen.queryByTestId("event-registration-submit")).toBeNull();
  });

  it("erro 4xx da API é mostrado com a mensagem da própria API", async () => {
    mockRegister.mockRejectedValue(
      new HttpError(400, { message: "Vagas esgotadas para este evento" }),
    );

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-submit"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("event-registration-action-error").props.children).toBe(
        "Vagas esgotadas para este evento",
      ),
    );
    expect(screen.getByTestId("event-registration-submit")).toBeTruthy();
  });

  it("5xx cai na mensagem genérica — o texto do servidor não serve ao usuário", async () => {
    mockRegister.mockRejectedValue(new HttpError(503, { message: "Serviço PIX indisponível" }));

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-submit"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("event-registration-action-error").props.children).toBe(
        "Não foi possível concluir. Tente novamente.",
      ),
    );
  });

  it("erro de rede ao inscrever cai na mensagem genérica", async () => {
    mockRegister.mockRejectedValue(new NetworkError());

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-submit"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("event-registration-action-error").props.children).toBe(
        "Não foi possível concluir. Tente novamente.",
      ),
    );
  });

  it("erro ao cancelar mantém a inscrição em tela", async () => {
    mockGetMine.mockResolvedValue({
      id: "r1",
      full_name: "Ana",
      status: "confirmed",
      payment_status: "not_required",
      created_at: "2026-09-16T10:00:00.000Z",
    });
    mockCancel.mockRejectedValue(new NetworkError());

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-cancel")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-cancel"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("event-registration-action-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("event-registration-cancel")).toBeTruthy();
  });

  it("toque duplo em 'Inscrever-se' manda um POST só — dois custariam duas cobranças", async () => {
    let resolveRegister: (value: unknown) => void = () => {};
    mockRegister.mockImplementation(
      () => new Promise((resolve) => (resolveRegister = resolve)),
    );

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-submit"));
      fireEvent.press(screen.getByTestId("event-registration-submit"));
    });

    expect(mockRegister).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRegister({ id: "r1", status: "confirmed" });
    });
  });

  it("toque duplo em 'Cancelar inscrição' manda um DELETE só", async () => {
    mockGetMine.mockResolvedValue({ id: "r1", status: "confirmed" });
    let resolveCancel: (value: unknown) => void = () => {};
    mockCancel.mockImplementation(() => new Promise((resolve) => (resolveCancel = resolve)));

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-cancel")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-cancel"));
      fireEvent.press(screen.getByTestId("event-registration-cancel"));
    });

    expect(mockCancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCancel({ id: "r1", status: "cancelled" });
    });
  });

  it("a releitura do resumo falhar depois de inscrever não derruba a inscrição da tela", async () => {
    mockRegister.mockResolvedValue({ id: "r1", status: "confirmed" });
    mockGetSummary.mockResolvedValueOnce(FREE_OPEN).mockRejectedValueOnce(new NetworkError());

    await renderPanel();
    await waitFor(() => expect(screen.getByTestId("event-registration-submit")).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId("event-registration-submit"));
    });

    await waitFor(() => expect(screen.getByTestId("event-registration-cancel")).toBeTruthy());
    expect(screen.queryByTestId("event-registration-action-error")).toBeNull();
  });
});
