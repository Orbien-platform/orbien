// Tela "Dízimo automático" (PROD-28). Testes derivados da spec
// (`.specs/features/pix-recorrente-doador-mobile/spec.md`): indisponível
// com a trava desligada (PRD-DONOR-10), contratar exige aceite e valor
// dentro dos limites (PRD-DONOR-08), "cancelado" só depois de a API
// confirmar — falha deixa claro que segue ativo (P1 cancelar, AC3).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert as NativeAlert } from "react-native";

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockCancel = jest.fn();
const mockFetchEnabled = jest.fn();
jest.mock("../../lib/pix-recorrente/pix-recorrente-client", () => {
  const actual = jest.requireActual("../../lib/pix-recorrente/pix-recorrente-client");
  return {
    ...actual,
    listMySubscriptions: (...args: unknown[]) => mockList(...args),
    createMySubscription: (...args: unknown[]) => mockCreate(...args),
    cancelMySubscription: (...args: unknown[]) => mockCancel(...args),
    fetchAsaasPaymentsEnabled: (...args: unknown[]) => mockFetchEnabled(...args),
  };
});
jest.mock("../../lib/auth/auth-client", () => ({ authenticatedRequest: jest.fn() }));

import DizimoAutomaticoScreen from "../../app/dizimo-automatico";
import { HttpError, NetworkError } from "../../lib/api/errors";

const ACTIVE = {
  id: "sub-1",
  amount: "150.00",
  status: "active" as const,
  created_at: "2026-10-01T12:00:00.000Z",
  cancelled_at: null,
  payments: [{ id: "pay-1", amount: "150.00", paid_at: "2026-10-02T12:00:00.000Z" }],
};

async function renderScreen() {
  await act(async () => {
    render(<DizimoAutomaticoScreen />);
  });
}

/** Aperta o botão destrutivo do diálogo nativo de confirmação. */
function confirmNativeDialog() {
  const spy = jest.mocked(NativeAlert.alert);
  const buttons = spy.mock.calls[spy.mock.calls.length - 1]?.[2] ?? [];
  const destructive = buttons.find((b) => b.style === "destructive");
  return destructive?.onPress?.();
}

describe("DizimoAutomaticoScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(NativeAlert, "alert").mockImplementation(() => undefined);
    mockFetchEnabled.mockResolvedValue(true);
    mockList.mockResolvedValue([]);
  });

  it("trava desligada e nenhuma assinatura: mostra indisponível, sem formulário", async () => {
    mockFetchEnabled.mockResolvedValue(false);

    await renderScreen();

    expect(screen.getByTestId("dizimo-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("dizimo-submit")).toBeNull();
  });

  it("trava desligada mas com assinatura ativa: ainda mostra e deixa cancelar", async () => {
    mockFetchEnabled.mockResolvedValue(false);
    mockList.mockResolvedValue([ACTIVE]);

    await renderScreen();

    expect(screen.getByTestId("dizimo-active")).toBeTruthy();
    expect(screen.getByTestId("dizimo-cancel")).toBeTruthy();
  });

  it("assinatura ativa mostra o valor mensal e as contribuições confirmadas", async () => {
    mockList.mockResolvedValue([ACTIVE]);

    await renderScreen();

    expect(screen.getByTestId("dizimo-amount").props.children).toBe("R$ 150,00");
    expect(screen.getByText("2 de outubro de 2026")).toBeTruthy();
  });

  it("sem contribuição confirmada ainda, diz isso em vez de lista vazia", async () => {
    mockList.mockResolvedValue([{ ...ACTIVE, payments: [] }]);

    await renderScreen();

    expect(screen.getByTestId("dizimo-no-payments")).toBeTruthy();
  });

  it("contratar exige valor válido E aceite marcado", async () => {
    await renderScreen();

    expect(screen.getByTestId("dizimo-submit").props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId("dizimo-amount-input"), "150");
    expect(screen.getByTestId("dizimo-submit").props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId("dizimo-consent"));
    expect(screen.getByTestId("dizimo-submit").props.accessibilityState?.disabled).toBe(false);
  });

  it("valor fora dos limites mostra o erro e não deixa enviar", async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId("dizimo-amount-input"), "5");
    await fireEvent.press(screen.getByTestId("dizimo-consent"));

    expect(screen.getByTestId("dizimo-amount-error")).toBeTruthy();
    expect(screen.getByTestId("dizimo-submit").props.accessibilityState?.disabled).toBe(true);
  });

  it("contratar envia o valor, confirma e recarrega mostrando a ativa", async () => {
    mockCreate.mockResolvedValue({ id: "sub-1" });
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId("dizimo-amount-input"), "150,00");
    await fireEvent.press(screen.getByTestId("dizimo-consent"));
    mockList.mockResolvedValue([ACTIVE]);
    await act(async () => {
      await fireEvent.press(screen.getByTestId("dizimo-submit"));
    });

    expect(mockCreate).toHaveBeenCalledWith(150);
    expect(screen.getByTestId("dizimo-notice")).toBeTruthy();
    expect(screen.getByTestId("dizimo-active")).toBeTruthy();
  });

  it("409 da API (já tem ativa) aparece com a mensagem da API", async () => {
    mockCreate.mockRejectedValue(
      new HttpError(409, { message: "Você já tem um dízimo automático ativo" }),
    );
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId("dizimo-amount-input"), "150");
    await fireEvent.press(screen.getByTestId("dizimo-consent"));
    await act(async () => {
      await fireEvent.press(screen.getByTestId("dizimo-submit"));
    });

    expect(screen.getByText("Você já tem um dízimo automático ativo")).toBeTruthy();
  });

  it("cancelar pede confirmação e só diz 'cancelado' depois de a API confirmar", async () => {
    mockList.mockResolvedValue([ACTIVE]);
    mockCancel.mockResolvedValue({ id: "sub-1", status: "cancelled" });
    await renderScreen();

    await fireEvent.press(screen.getByTestId("dizimo-cancel"));
    expect(mockCancel).not.toHaveBeenCalled();

    mockList.mockResolvedValue([{ ...ACTIVE, status: "cancelled" }]);
    await act(async () => {
      await confirmNativeDialog();
    });

    expect(mockCancel).toHaveBeenCalledWith("sub-1");
    await waitFor(() => expect(screen.getByText("Dízimo automático cancelado.")).toBeTruthy());
  });

  it("cancelamento que falha diz que o dízimo continua ativo — nunca 'cancelado'", async () => {
    mockList.mockResolvedValue([ACTIVE]);
    mockCancel.mockRejectedValue(new HttpError(500, {}));
    await renderScreen();

    await fireEvent.press(screen.getByTestId("dizimo-cancel"));
    await act(async () => {
      await confirmNativeDialog();
    });

    expect(screen.getByTestId("dizimo-action-error")).toBeTruthy();
    expect(screen.queryByText("Dízimo automático cancelado.")).toBeNull();
    expect(screen.getByTestId("dizimo-active")).toBeTruthy();
  });

  it("sem conexão ao contratar, diz que é a conexão — não o servidor", async () => {
    mockCreate.mockRejectedValue(new NetworkError());
    await renderScreen();

    await fireEvent.changeText(screen.getByTestId("dizimo-amount-input"), "150");
    await fireEvent.press(screen.getByTestId("dizimo-consent"));
    await act(async () => {
      await fireEvent.press(screen.getByTestId("dizimo-submit"));
    });

    expect(screen.getByText("Sem conexão. Verifique a internet e tente de novo.")).toBeTruthy();
  });

  it("lista várias contribuições; valor numérico e pagamento sem data não quebram a tela", async () => {
    mockList.mockResolvedValue([
      {
        ...ACTIVE,
        amount: 80,
        created_at: "data-invalida",
        payments: [
          { id: "pay-1", amount: 80, paid_at: "2026-10-02T12:00:00.000Z" },
          { id: "pay-2", amount: "80.00", paid_at: null },
        ],
      },
    ]);

    await renderScreen();

    expect(screen.getByTestId("dizimo-amount").props.children).toBe("R$ 80,00");
    expect(screen.getByText("Data não informada")).toBeTruthy();
    // Sem data de início legível, a frase não inventa uma.
    expect(screen.getByText("Cobrança mensal via PIX.")).toBeTruthy();
  });

  it("sem conexão ao carregar, mostra o erro de conexão (não o de servidor)", async () => {
    mockList.mockRejectedValue(new NetworkError());

    await renderScreen();

    expect(screen.getByText(/Verifique sua conexão/)).toBeTruthy();
  });

  it("resposta que chega depois de a tela fechar é ignorada (sucesso e falha)", async () => {
    let resolveList!: (value: unknown) => void;
    mockList.mockReturnValue(new Promise((r) => (resolveList = r)));
    const view = await render(<DizimoAutomaticoScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolveList([ACTIVE]);
    });

    let rejectList!: (reason: unknown) => void;
    mockList.mockReturnValue(new Promise((_, r) => (rejectList = r)));
    const second = await render(<DizimoAutomaticoScreen />);
    await act(async () => {
      second.unmount();
    });
    await act(async () => {
      rejectList(new Error("500"));
    });

    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it("falha ao carregar mostra erro com 'Tentar de novo'", async () => {
    mockList.mockRejectedValue(new Error("500"));

    await renderScreen();

    expect(screen.getByTestId("dizimo-load-error")).toBeTruthy();
    expect(screen.getByTestId("dizimo-retry")).toBeTruthy();
  });
});
