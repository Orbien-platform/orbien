// Testes derivados do Done-when de T7 (tasks.md, MOB-09-03): encontros
// ordenados por occurred_at desc, estado vazio, erro, navegação.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { NetworkError } from "../../../lib/api/errors";

const mockPush = jest.fn();
let mockParams: { id: string; role?: string } = { id: "sg1" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}));

const mockListMeetings = jest.fn();
const mockListGroupMaterials = jest.fn();
jest.mock("../../../lib/pequenos-grupos/pequenos-grupos-client", () => ({
  listMeetings: (...args: unknown[]) => mockListMeetings(...args),
  listGroupMaterials: (...args: unknown[]) => mockListGroupMaterials(...args),
}));


import GrupoScreen from "../../../app/grupo/[id]";

describe("GrupoScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "sg1" };
    mockListGroupMaterials.mockResolvedValue([]);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  });

  it("lista os encontros ordenados por occurred_at desc (MOB-09-03)", async () => {
    mockListMeetings.mockResolvedValue([
      { id: "m1", occurred_at: "2026-08-01T19:00:00.000Z", topic: "Encontro antigo" },
      { id: "m2", occurred_at: "2026-09-01T19:00:00.000Z", topic: "Encontro recente" },
    ]);

    await act(async () => {
      render(<GrupoScreen />);
    });

    const list = screen.getByTestId("grupo-meetings-list");
    expect(list.props.data.map((m: { id: string }) => m.id)).toEqual(["m2", "m1"]);
  });

  it("lista vazia mostra 'Nenhum encontro registrado.'", async () => {
    mockListMeetings.mockResolvedValue([]);

    await act(async () => {
      render(<GrupoScreen />);
    });

    expect(screen.getByTestId("grupo-empty")).toBeTruthy();
    expect(screen.getByText("Nenhum encontro registrado.")).toBeTruthy();
  });

  it("erro de rede mostra estado de erro explícito", async () => {
    mockListMeetings.mockRejectedValue(new NetworkError());

    await act(async () => {
      render(<GrupoScreen />);
    });

    expect(screen.getByTestId("grupo-error")).toBeTruthy();
    expect(
      screen.getByText("Não foi possível carregar os encontros. Verifique sua conexão."),
    ).toBeTruthy();
  });

  it("erro de rede oferece tentar novamente, que refaz a busca", async () => {
    mockListMeetings.mockRejectedValueOnce(new NetworkError());
    mockListMeetings.mockResolvedValueOnce([
      { id: "m1", occurred_at: "2026-09-01T19:00:00.000Z", topic: "Encontro" },
    ]);

    await act(async () => {
      render(<GrupoScreen />);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("grupo-retry"));
    });

    expect(mockListMeetings).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("encontro-m1")).toBeTruthy();
  });

  it("toque num encontro navega para /grupo/encontro/[id]", async () => {
    mockListMeetings.mockResolvedValue([
      { id: "m1", occurred_at: "2026-09-01T19:00:00.000Z", topic: "Encontro" },
    ]);

    await act(async () => {
      render(<GrupoScreen />);
    });
    fireEvent.press(screen.getByTestId("encontro-m1"));

    expect(mockPush).toHaveBeenCalledWith("/grupo/encontro/m1");
  });

  it("ignora a resposta que chega depois de a tela desmontar", async () => {
    let resolve!: (value: unknown) => void;
    mockListMeetings.mockReturnValue(new Promise((r) => (resolve = r)));

    const view = await render(<GrupoScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolve([]);
    });

    expect(mockListMeetings).toHaveBeenCalled();
  });

  it("ignora a falha que chega depois de a tela desmontar", async () => {
    let reject!: (reason: unknown) => void;
    mockListMeetings.mockReturnValue(new Promise((_, r) => (reject = r)));

    const view = await render(<GrupoScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      reject(new Error("falha de rede"));
    });

    expect(mockListMeetings).toHaveBeenCalled();
  });

  it("erro que não é de conexão mostra a mensagem genérica", async () => {
    mockListMeetings.mockRejectedValue(new Error("500"));

    await render(<GrupoScreen />);

    expect(await screen.findByTestId("grupo-error")).toBeTruthy();
    expect(screen.queryByText(/Verifique sua conexão/)).toBeNull();
  });

  it("encontro sem tema usa a data como rótulo; sem tema nem data, 'Encontro'", async () => {
    mockListMeetings.mockResolvedValue([
      { id: "m1", occurred_at: "2026-09-01T19:00:00.000Z", topic: null },
      { id: "m2", occurred_at: "data inválida", topic: null },
    ]);

    await render(<GrupoScreen />);

    const semTema = await screen.findByTestId("encontro-m1");
    expect(semTema.props.accessibilityLabel).not.toBe("Encontro");
    expect(screen.getByTestId("encontro-m2").props.accessibilityLabel).toBe("Encontro");
    expect(screen.getAllByText("Encontro")).toHaveLength(2);
  });

  describe("Fazer check-in (PROD-12)", () => {
    const MEETINGS = [{ id: "m1", occurred_at: "2026-09-01T19:00:00.000Z", topic: "Estudo" }];

    it("membro vê o atalho, que abre o leitor", async () => {
      mockParams = { id: "sg1", role: "member" };
      mockListMeetings.mockResolvedValue(MEETINGS);
      await act(async () => {
        render(<GrupoScreen />);
      });

      fireEvent.press(screen.getByTestId("grupo-fazer-checkin"));
      expect(mockPush).toHaveBeenCalledWith("/checkin");
    });

    it("quem lidera o grupo não vê — mostra o QR pelo encontro", async () => {
      mockParams = { id: "sg1", role: "leader" };
      mockListMeetings.mockResolvedValue(MEETINGS);
      await act(async () => {
        render(<GrupoScreen />);
      });
      expect(screen.queryByTestId("grupo-fazer-checkin")).toBeNull();
    });
  });

  describe("materiais do grupo (PROD-38)", () => {
    const MATERIALS = [
      {
        id: "mat1",
        title: "Roteiro da rede",
        source_type: "pdf",
        file_url: "https://cdn/roteiro.pdf",
        rich_content: null,
        visibility: "all",
        publish_at: "2026-01-10T12:00:00.000Z",
      },
      {
        id: "mat2",
        title: "Guia dos líderes",
        source_type: "doc",
        file_url: "https://signed/guia.docx",
        rich_content: null,
        visibility: "leaders_only",
        publish_at: "2999-01-10T12:00:00.000Z",
      },
      {
        id: "mat3",
        title: "Reflexão",
        source_type: "rich_text",
        file_url: null,
        rich_content: "Leia Rute 1.",
        visibility: "all",
        publish_at: "2026-01-10T12:00:00.000Z",
      },
      {
        id: "mat4",
        title: "Sem arquivo",
        source_type: "pdf",
        file_url: null,
        rich_content: null,
        visibility: "all",
        publish_at: "2026-01-10T12:00:00.000Z",
      },
    ];

    beforeEach(() => {
      mockListMeetings.mockResolvedValue([
        { id: "m1", occurred_at: "2026-08-01T19:00:00.000Z", topic: "Encontro" },
      ]);
    });

    it("mostra os materiais acima dos encontros e abre o arquivo", async () => {
      mockListGroupMaterials.mockResolvedValue(MATERIALS);

      await act(async () => {
        await render(<GrupoScreen />);
      });

      expect(mockListGroupMaterials).toHaveBeenCalledWith("sg1");
      expect(screen.getByText("Roteiro da rede")).toBeTruthy();
      expect(screen.getByText("Leia Rute 1.")).toBeTruthy();
      expect(screen.getByText("Somente líderes")).toBeTruthy();
      expect(screen.getByText(/^Libera em/)).toBeTruthy();

      await fireEvent.press(screen.getByTestId("grupo-material-mat1-abrir"));
      expect(Linking.openURL).toHaveBeenCalledWith("https://cdn/roteiro.pdf");
      await fireEvent.press(screen.getByTestId("grupo-material-mat2-abrir"));
      expect(Linking.openURL).toHaveBeenCalledWith("https://signed/guia.docx");

      expect(Linking.openURL).toHaveBeenCalledTimes(2);
    });

    it("sem materiais não mostra a seção", async () => {
      await act(async () => {
        await render(<GrupoScreen />);
      });

      expect(screen.getByTestId("encontro-m1")).toBeTruthy();
      expect(screen.queryByTestId("grupo-materials")).toBeNull();
      expect(screen.queryByTestId("grupo-materials-error")).toBeNull();
    });

    it("grupo sem encontros mas com material mostra o material, não o estado vazio", async () => {
      mockListMeetings.mockResolvedValue([]);
      mockListGroupMaterials.mockResolvedValue([MATERIALS[0]]);

      await act(async () => {
        await render(<GrupoScreen />);
      });

      expect(screen.queryByTestId("grupo-empty")).toBeNull();
      expect(screen.getByText("Roteiro da rede")).toBeTruthy();
    });

    it("falha nos materiais avisa, mas os encontros continuam na tela", async () => {
      mockListGroupMaterials.mockRejectedValue(new NetworkError());

      await act(async () => {
        await render(<GrupoScreen />);
      });

      expect(screen.getByTestId("grupo-materials-error")).toBeTruthy();
      expect(screen.getByTestId("encontro-m1")).toBeTruthy();
      expect(screen.queryByTestId("grupo-error")).toBeNull();
    });

    it("sair antes das respostas não atualiza o estado", async () => {
      let resolveMaterials!: (v: unknown) => void;
      let rejectMaterials!: (e: unknown) => void;
      mockListGroupMaterials.mockReturnValueOnce(new Promise((r) => (resolveMaterials = r)));

      const first = await render(<GrupoScreen />);
      await first.unmount();
      resolveMaterials(MATERIALS);

      mockListGroupMaterials.mockReturnValueOnce(new Promise((_, r) => (rejectMaterials = r)));
      const second = await render(<GrupoScreen />);
      await second.unmount();
      rejectMaterials(new Error("tarde"));
      await act(async () => {});
    });
  });
});
