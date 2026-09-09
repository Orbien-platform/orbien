// Testes derivados do Done-when de T6 (tasks.md, MOB-08-02/03/04/05):
// destaque de "minha função", setlist ausente, OC não publicada, 404 e
// erro de rede com retry.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

let mockSearchParams: { id: string; ministryId?: string } = { id: "ord1" };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
}));

const mockGetServiceOrder = jest.fn();
jest.mock("../../../lib/celebracoes/celebracoes-client", () => ({
  getServiceOrder: (...args: unknown[]) => mockGetServiceOrder(...args),
}));

import { HttpError } from "../../../lib/api/errors";
import CelebracaoScreen from "../../../app/celebracao/[id]";

const BASE_ORDER = {
  id: "ord1",
  title: "OC de Domingo",
  published_at: "2026-09-01T00:00:00.000Z",
  celebrationInstance: {
    id: "inst1",
    scheduled_date: "2026-09-13T13:00:00.000Z",
    celebration: { id: "c1", name: "Culto de Domingo" },
  },
  items: [],
};

describe("CelebracaoScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { id: "ord1" };
  });

  it("destaca a etapa cujo ministry.id bate com o ministryId do param (AC3)", async () => {
    mockSearchParams = { id: "ord1", ministryId: "min1" };
    mockGetServiceOrder.mockResolvedValue({
      ...BASE_ORDER,
      items: [
        {
          id: "item1",
          sequence: 1,
          name: "Louvor de abertura",
          type: "worship",
          start_offset_minutes: 0,
          duration_minutes: 20,
          responsible_type: "ministry",
          person: null,
          ministry: { id: "min1", name: "Louvor" },
          responsible_label: null,
          notes: null,
          setlist: null,
        },
        {
          id: "item2",
          sequence: 2,
          name: "Pregação",
          type: "sermon",
          start_offset_minutes: 20,
          duration_minutes: 30,
          responsible_type: "person",
          person: { id: "p1", full_name: "Pastor João" },
          ministry: null,
          responsible_label: null,
          notes: null,
          setlist: null,
        },
      ],
    });

    await act(async () => {
      render(<CelebracaoScreen />);
    });

    expect(screen.getByTestId("celebracao-item-item1-mine")).toBeTruthy();
    expect(screen.getByTestId("celebracao-item-item2")).toBeTruthy();
    expect(screen.queryByTestId("celebracao-item-item2-mine")).toBeNull();
  });

  it("etapa sem setlist mostra 'Repertório ainda não publicado' (AC4)", async () => {
    mockGetServiceOrder.mockResolvedValue({
      ...BASE_ORDER,
      items: [
        {
          id: "item1",
          sequence: 1,
          name: "Louvor",
          type: "worship",
          start_offset_minutes: 0,
          duration_minutes: 20,
          responsible_type: "free_text",
          person: null,
          ministry: null,
          responsible_label: "A definir",
          notes: null,
          setlist: null,
        },
      ],
    });

    await act(async () => {
      render(<CelebracaoScreen />);
    });

    expect(screen.getByText("Repertório ainda não publicado")).toBeTruthy();
  });

  it("etapa com setlist mostra as músicas", async () => {
    mockGetServiceOrder.mockResolvedValue({
      ...BASE_ORDER,
      items: [
        {
          id: "item1",
          sequence: 1,
          name: "Louvor",
          type: "worship",
          start_offset_minutes: 0,
          duration_minutes: 20,
          responsible_type: "free_text",
          person: null,
          ministry: null,
          responsible_label: "A definir",
          notes: null,
          setlist: {
            songs: [
              {
                id: "sg1",
                sequence: 1,
                title: "Grande é o Senhor",
                key: "G",
                key_alt: null,
                bpm: 80,
                link: null,
                youtube_link: null,
                spotify_link: null,
                cifra_club_link: null,
              },
            ],
          },
        },
      ],
    });

    await act(async () => {
      render(<CelebracaoScreen />);
    });

    expect(screen.getByText("Grande é o Senhor")).toBeTruthy();
  });

  it("OC com published_at nulo mostra o aviso de rascunho, sem esconder os itens (AC não publicada)", async () => {
    mockGetServiceOrder.mockResolvedValue({ ...BASE_ORDER, published_at: null });

    await act(async () => {
      render(<CelebracaoScreen />);
    });

    expect(screen.getByTestId("celebracao-unpublished-warning")).toBeTruthy();
    expect(screen.getByTestId("celebracao-title")).toBeTruthy();
  });

  it("OC publicada não mostra o aviso de rascunho", async () => {
    mockGetServiceOrder.mockResolvedValue(BASE_ORDER);

    await act(async () => {
      render(<CelebracaoScreen />);
    });

    expect(screen.queryByTestId("celebracao-unpublished-warning")).toBeNull();
  });

  it("404 mostra 'Ordem de culto não encontrada.' sem botão de retry (AC5)", async () => {
    mockGetServiceOrder.mockRejectedValue(new HttpError(404, "not found"));

    await act(async () => {
      render(<CelebracaoScreen />);
    });

    expect(screen.getByText("Ordem de culto não encontrada.")).toBeTruthy();
    expect(screen.queryByTestId("celebracao-retry")).toBeNull();
  });

  it("erro de rede mostra mensagem genérica com opção de tentar novamente (AC5)", async () => {
    mockGetServiceOrder.mockRejectedValueOnce(new Error("network"));
    mockGetServiceOrder.mockResolvedValueOnce(BASE_ORDER);

    await act(async () => {
      render(<CelebracaoScreen />);
    });

    expect(
      screen.getByText("Não foi possível carregar a Ordem de Culto. Verifique sua conexão."),
    ).toBeTruthy();
    const retryButton = screen.getByTestId("celebracao-retry");

    fireEvent.press(retryButton);

    await waitFor(() => expect(screen.getByTestId("celebracao-title")).toBeTruthy());
    expect(mockGetServiceOrder).toHaveBeenCalledTimes(2);
  });
});
