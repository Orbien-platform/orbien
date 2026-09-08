// Testes de PostScreen (MOB-07, T7 do tasks.md).
import { act, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "post-1" }),
}));

const mockGetPost = jest.fn();
jest.mock("../../../lib/content/content-client", () => ({
  getPost: (...args: unknown[]) => mockGetPost(...args),
}));

import { HttpError, NetworkError } from "../../../lib/api/errors";
import PostScreen from "../../../app/post/[id]";

describe("PostScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("caminho feliz: mostra título e corpo do post carregado", async () => {
    mockGetPost.mockResolvedValue({
      id: "post-1",
      type: "announcement",
      title: "Culto especial",
      body: "Não perca o culto de domingo.",
      media_url: null,
      published_at: "2026-09-01T00:00:00.000Z",
      created_at: "2026-08-30T00:00:00.000Z",
    });

    await act(async () => {
      render(<PostScreen />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("post-title").props.children).toBe("Culto especial");
    });
    expect(screen.getByTestId("post-body").props.children).toBe("Não perca o culto de domingo.");
  });

  it("404: mostra 'Post não encontrado', sem travar", async () => {
    mockGetPost.mockRejectedValue(new HttpError(404, { message: "Post não encontrado" }));

    await act(async () => {
      render(<PostScreen />);
    });

    await waitFor(() => {
      expect(screen.getByText("Post não encontrado.")).toBeTruthy();
    });
  });

  it("erro de rede: mostra estado de erro genérico", async () => {
    mockGetPost.mockRejectedValue(new NetworkError());

    await act(async () => {
      render(<PostScreen />);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível carregar o post. Verifique sua conexão."),
      ).toBeTruthy();
    });
  });
});
