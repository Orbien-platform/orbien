// Testes derivados do Done-when de R3-T4 (tasks.md): lista renderiza
// (AC2), estado vazio explícito, erro de rede no load inicial, "carregar
// mais" concatena sem perder os já carregados, erro pontual de "carregar
// mais" não limpa a lista.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockGetPosts = jest.fn();
jest.mock("../../lib/content/content-client", () => ({
  getPosts: (...args: unknown[]) => mockGetPosts(...args),
}));

import ConteudoScreen from "./conteudo";

const POST_1 = { id: "p1", type: "announcement", title: "Post 1", body: "Corpo 1", media_url: null, published_at: "2026-09-01T10:00:00Z", created_at: "2026-09-01T10:00:00Z" };
const POST_2 = { id: "p2", type: "announcement", title: "Post 2", body: null, media_url: null, published_at: "2026-09-02T10:00:00Z", created_at: "2026-09-02T10:00:00Z" };

describe("ConteudoScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("carrega e lista os posts da página 1 (AC2)", async () => {
    mockGetPosts.mockResolvedValue({ data: [POST_1], total: 1 });

    await act(async () => {
      render(<ConteudoScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("post-p1")).toBeTruthy();
    });
    expect(mockGetPosts).toHaveBeenCalledWith(1, 20);
  });

  it("total 0 mostra estado vazio explícito, não erro", async () => {
    mockGetPosts.mockResolvedValue({ data: [], total: 0 });

    await act(async () => {
      render(<ConteudoScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("conteudo-empty")).toBeTruthy();
    });
    expect(screen.queryByTestId("conteudo-error")).toBeNull();
  });

  it("erro de rede no load inicial mostra estado de erro visível, não lista vazia", async () => {
    mockGetPosts.mockRejectedValue(new Error("falha de rede"));

    await act(async () => {
      render(<ConteudoScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("conteudo-error")).toBeTruthy();
    });
    expect(screen.queryByTestId("conteudo-list")).toBeNull();
    expect(screen.queryByTestId("conteudo-empty")).toBeNull();
  });

  it('"Carregar mais" concatena a página 2 aos posts já exibidos', async () => {
    mockGetPosts.mockResolvedValueOnce({ data: [POST_1], total: 25 });
    mockGetPosts.mockResolvedValueOnce({ data: [POST_2], total: 25 });

    await act(async () => {
      render(<ConteudoScreen />);
    });
    await waitFor(() => screen.getByTestId("load-more-button"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("load-more-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("post-p2")).toBeTruthy();
    });
    // o primeiro post continua na lista — concatenou, não substituiu.
    expect(screen.getByTestId("post-p1")).toBeTruthy();
    expect(mockGetPosts).toHaveBeenNthCalledWith(2, 2, 20);
    // page(2)*limit(20)=40 >= total(25) — não há mais páginas, botão some.
    expect(screen.queryByTestId("load-more-button")).toBeNull();
  });

  it('"Carregar mais" falha: posts já carregados continuam visíveis, erro pontual aparece', async () => {
    mockGetPosts.mockResolvedValueOnce({ data: [POST_1], total: 40 });
    mockGetPosts.mockRejectedValueOnce(new Error("falha de rede"));

    await act(async () => {
      render(<ConteudoScreen />);
    });
    await waitFor(() => screen.getByTestId("load-more-button"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("load-more-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("load-more-error")).toBeTruthy();
    });
    // o post já carregado continua visível — nada foi limpo.
    expect(screen.getByTestId("post-p1")).toBeTruthy();
  });

  it('duplo toque em "Carregar mais" antes da resposta dispara só uma chamada (guard de duplo toque)', async () => {
    mockGetPosts.mockResolvedValueOnce({ data: [POST_1], total: 25 });
    mockGetPosts.mockResolvedValueOnce({ data: [POST_2], total: 25 });

    await act(async () => {
      render(<ConteudoScreen />);
    });
    await waitFor(() => screen.getByTestId("load-more-button"));

    // dois toques síncronos, um logo após o outro — mesmo princípio do
    // guard em (tabs)/index.tsx: `await` sempre adia a continuação, então
    // o segundo toque, ainda síncrono, encontra `isLoadingMoreRef` já
    // marcado, mesmo com a resposta já resolvida.
    await act(async () => {
      fireEvent.press(screen.getByTestId("load-more-button"));
      fireEvent.press(screen.getByTestId("load-more-button"));
    });

    // 1 chamada inicial (page 1) + 1 de "carregar mais" — nunca 2.
    expect(mockGetPosts).toHaveBeenCalledTimes(2);
  });
});
