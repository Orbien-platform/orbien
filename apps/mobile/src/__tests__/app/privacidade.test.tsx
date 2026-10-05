// Privacidade e meus dados (v2, CONF-03): carrega os dados do titular,
// corrige, revoga consentimento com confirmação, exporta pela folha de
// compartilhamento e pede/cancela a exclusão.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Share } from "react-native";

const mockGet = jest.fn();
const mockExport = jest.fn();
const mockUpdate = jest.fn();
const mockRevoke = jest.fn();
const mockRequestDeletion = jest.fn();
const mockCancelDeletion = jest.fn();
jest.mock("../../lib/privacidade/privacidade-client", () => ({
  ...jest.requireActual("../../lib/privacidade/privacidade-client"),
  getPersonalData: () => mockGet(),
  exportPersonalData: () => mockExport(),
  updateMyData: (...args: unknown[]) => mockUpdate(...args),
  revokeConsent: (...args: unknown[]) => mockRevoke(...args),
  requestDeletion: () => mockRequestDeletion(),
  cancelDeletion: () => mockCancelDeletion(),
}));

import { HttpError, NetworkError } from "../../lib/api/errors";
import PrivacidadeScreen from "../../app/privacidade";

function data(overrides: Record<string, unknown> = {}) {
  return {
    person: {
      id: "p1",
      full_name: "Ana Souza",
      phone: "11999990000",
      email: "ana@x.fake",
      birth_date: null,
      address_street: "Rua A",
      address_number: "10",
      address_complement: null,
      address_neighborhood: null,
      address_city: "São Paulo",
      address_state: "SP",
      address_zip: null,
      classification: "member",
    },
    consents: [
      {
        id: "c1",
        version: "member_consent_v1",
        consented_at: "2026-01-10T12:00:00.000Z",
        origin: null,
        revoked_at: null,
      },
    ],
    groups: [],
    visits: [],
    donations: [],
    deletion: { requested_at: null, anonymize_after: null, cancellable: false },
    ...overrides,
  };
}

async function renderScreen() {
  await act(async () => {
    render(<PrivacidadeScreen />);
  });
}

describe("PrivacidadeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(data());
  });

  it("mostra os dados e os consentimentos do titular", async () => {
    await renderScreen();
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(screen.getByText("Rua A, 10 · São Paulo · SP")).toBeTruthy();
    expect(screen.getByText("Cadastro de membro e dado religioso")).toBeTruthy();
  });

  it("conta sem pessoa vinculada explica e não oferece ação", async () => {
    mockGet.mockRejectedValue(new HttpError(404, { message: "x" }));
    await renderScreen();
    expect(screen.getByTestId("privacidade-sem-cadastro")).toBeTruthy();
  });

  it("erro de rede oferece tentar de novo", async () => {
    mockGet.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    expect(screen.getByTestId("privacidade-erro")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-retry"));
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Ana Souza")).toBeTruthy();
  });

  it("corrige o telefone e reflete sem recarregar", async () => {
    mockUpdate.mockResolvedValue({ ...data().person, phone: "11888880000" });
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-corrigir"));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId("privacidade-telefone"), "11888880000");
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-salvar"));
    });

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ phone: "11888880000" }));
    expect(screen.queryByTestId("privacidade-edicao")).toBeNull();
    expect(screen.getByText("11888880000")).toBeTruthy();
  });

  it("falha ao salvar mantém o formulário e avisa", async () => {
    mockUpdate.mockRejectedValue(new NetworkError());
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-corrigir"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-salvar"));
    });
    expect(screen.getByTestId("privacidade-edicao")).toBeTruthy();
    expect(screen.getByTestId("privacidade-acao-erro")).toBeTruthy();
  });

  it("revogar pede confirmação antes de chamar a API", async () => {
    mockRevoke.mockResolvedValue({ revoked: 1 });
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId("revogar-c1"));
    });
    expect(mockRevoke).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId("revogar-confirmar-c1"));
    });
    expect(mockRevoke).toHaveBeenCalledWith("member_consent_v1");
    expect(screen.queryByTestId("revogar-c1")).toBeNull();
    expect(screen.getByText(/Revogado em/)).toBeTruthy();
  });

  it("exporta pela folha de compartilhamento do sistema", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    mockExport.mockResolvedValue({ format: "orbien.personal-data.v1" });
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-exportar-item"));
    });
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("orbien.personal-data.v1") }),
    );
  });

  it("pedir exclusão confirma, mostra a data e permite cancelar", async () => {
    mockRequestDeletion.mockResolvedValue({
      requested_at: "2026-10-04T12:00:00.000Z",
      anonymize_after: "2026-11-03T12:00:00.000Z",
      cancellable: true,
    });
    mockCancelDeletion.mockResolvedValue({
      requested_at: null,
      anonymize_after: null,
      cancellable: false,
    });
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-pedir-exclusao"));
    });
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-confirmar-exclusao-botao"));
    });
    expect(screen.getByTestId("privacidade-exclusao-pedida")).toBeTruthy();
    expect(screen.getByText(/3 de novembro de 2026/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-cancelar-exclusao"));
    });
    expect(mockCancelDeletion).toHaveBeenCalled();
    expect(screen.getByTestId("privacidade-pedir-exclusao")).toBeTruthy();
  });

  it("removido pela igreja: mostra o aviso e não oferece cancelar", async () => {
    mockGet.mockResolvedValue(
      data({
        deletion: {
          requested_at: "2026-10-04T12:00:00.000Z",
          anonymize_after: "2026-11-03T12:00:00.000Z",
          cancellable: false,
        },
      }),
    );
    await renderScreen();
    expect(screen.getByTestId("privacidade-removido-pela-igreja")).toBeTruthy();
    expect(screen.queryByTestId("privacidade-cancelar-exclusao")).toBeNull();
    expect(screen.queryByTestId("privacidade-pedir-exclusao")).toBeNull();
  });

  it("cadastro sem endereço e sem contato mostra 'Não informado' e edita campo a campo", async () => {
    const person = {
      ...data().person,
      phone: null,
      email: null,
      address_street: null,
      address_number: null,
      address_city: null,
      address_state: null,
    };
    mockGet.mockResolvedValue(data({ person, consents: [] }));
    mockUpdate.mockImplementation(async (patch: Record<string, unknown>) => ({ ...person, ...patch }));
    await renderScreen();

    expect(screen.getAllByText("Não informado")).toHaveLength(3);
    expect(screen.getByText("Nenhum consentimento registrado para o seu cadastro.")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-corrigir"));
    });
    const campos: Array<[string, string]> = [
      ["privacidade-nome", "Ana S."],
      ["privacidade-telefone", "11977776666"],
      ["privacidade-rua", "Rua B"],
      ["privacidade-numero", "20"],
      ["privacidade-bairro", "Centro"],
      ["privacidade-cidade", "Campinas"],
    ];
    for (const [id, value] of campos) {
      expect(screen.getByTestId(id).props.value).toBe(id === "privacidade-nome" ? "Ana Souza" : "");
      await act(async () => {
        fireEvent.changeText(screen.getByTestId(id), value);
      });
    }
    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-salvar"));
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      full_name: "Ana S.",
      phone: "11977776666",
      address_street: "Rua B",
      address_number: "20",
      address_neighborhood: "Centro",
      address_city: "Campinas",
    });
    expect(screen.getByText("Rua B, 20 · Centro · Campinas")).toBeTruthy();
  });

  it("cancelar a edição volta para os dados", async () => {
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-corrigir"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-cancelar-edicao"));
    });
    expect(screen.getByTestId("privacidade-dados")).toBeTruthy();
  });

  it("revogar uma versão só marca os aceites ativos dela; 'Manter' desiste", async () => {
    mockRevoke.mockResolvedValue({ revoked: 1 });
    mockGet.mockResolvedValue(
      data({
        consents: [
          { id: "c1", version: "member_consent_v1", consented_at: "2026-01-10T12:00:00.000Z", origin: null, revoked_at: null },
          { id: "c2", version: "visitor_consent_v1", consented_at: "não é data", origin: null, revoked_at: null },
          {
            id: "c3",
            version: "member_consent_v1",
            consented_at: "2025-01-10T12:00:00.000Z",
            origin: null,
            revoked_at: "2025-06-01T12:00:00.000Z",
          },
        ],
      }),
    );
    await renderScreen();

    expect(screen.getByText("Dado em data não registrada")).toBeTruthy();
    expect(screen.getByText("Revogado em 1 de junho de 2025")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId("revogar-c2"));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Manter"));
    });
    expect(screen.queryByTestId("revogar-confirmar-c2")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("revogar-c1"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("revogar-confirmar-c1"));
    });
    expect(mockRevoke).toHaveBeenCalledWith("member_consent_v1");
    // O outro termo segue ativo, e o aceite já revogado mantém a data dele.
    expect(screen.getByTestId("revogar-c2")).toBeTruthy();
    expect(screen.getByText("Revogado em 1 de junho de 2025")).toBeTruthy();
  });

  it("'Voltar' desiste do pedido de exclusão", async () => {
    await renderScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId("privacidade-pedir-exclusao"));
    });
    await act(async () => {
      fireEvent.press(screen.getByText("Voltar"));
    });
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    expect(screen.getByTestId("privacidade-pedir-exclusao")).toBeTruthy();
  });

  it("removido pela igreja sem data de anonimização cai no prazo padrão", async () => {
    mockGet.mockResolvedValue(
      data({ deletion: { requested_at: "2026-10-04T12:00:00.000Z", anonymize_after: null, cancellable: false } }),
    );
    await renderScreen();
    expect(screen.getByText(/30 dias/)).toBeTruthy();
  });

  it("erro do servidor (não de rede) mostra o erro sem falar de conexão", async () => {
    mockGet.mockRejectedValue(new HttpError(500, { message: "x" }));
    await renderScreen();
    expect(screen.getByTestId("privacidade-erro")).toBeTruthy();
    expect(screen.getByText(/O problema é do nosso lado/)).toBeTruthy();
  });

  it("ignora a resposta e a falha que chegam depois de sair da tela", async () => {
    let resolve!: (value: unknown) => void;
    mockGet.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const first = await render(<PrivacidadeScreen />);
    await act(async () => {
      first.unmount();
    });
    await act(async () => {
      resolve(data());
    });

    let reject!: (reason: unknown) => void;
    mockGet.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    const second = await render(<PrivacidadeScreen />);
    await act(async () => {
      second.unmount();
    });
    await act(async () => {
      reject(new NetworkError());
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
