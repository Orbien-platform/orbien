// Testes de PostScreen (MOB-07, T7 do tasks.md).
import { act, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "post-1" }),
}));

const mockGetPost = jest.fn();
jest.mock("../../../lib/content/content-client", () => ({
  getPost: (...args: unknown[]) => mockGetPost(...args),
}));

// O painel de inscrição tem testes próprios (EventRegistrationPanel.test.tsx)
// e faz chamadas de rede por conta própria; aqui só importa SE ele é montado.
jest.mock("../../../components/EventRegistrationPanel", () => {
  const { Text } = require("react-native");
  return {
    EventRegistrationPanel: ({ postId }: { postId: string }) => (
      <Text testID="event-registration-panel">{postId}</Text>
    ),
  };
});

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

  const EVENT_POST = {
    id: "post-1",
    type: "event",
    title: "Retiro de jovens",
    body: null,
    media_url: null,
    published_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-08-30T00:00:00.000Z",
    event_starts_at: "2026-10-10T19:00:00.000Z",
    event_location: "Templo sede",
    registration_enabled: true,
  };

  it("post de evento mostra quando e onde, e monta o painel de inscrição", async () => {
    mockGetPost.mockResolvedValue(EVENT_POST);

    await act(async () => {
      render(<PostScreen />);
    });

    await waitFor(() => expect(screen.getByTestId("post-event")).toBeTruthy());
    expect(screen.getByTestId("post-event-date")).toBeTruthy();
    expect(screen.getByTestId("post-event-location").props.children).toBe("Templo sede");
    expect(screen.getByTestId("event-registration-panel").props.children).toBe("post-1");
  });

  // O painel é montado para todo post de evento, inclusive com
  // `registration_enabled: false` — é ele que decide não desenhar nada.
  // Sem isso, desligar as inscrições tirava o botão de cancelar de quem já
  // estava inscrito.
  it("evento com inscrição desligada ainda monta o painel — quem decide é ele", async () => {
    mockGetPost.mockResolvedValue({ ...EVENT_POST, registration_enabled: false });

    await act(async () => {
      render(<PostScreen />);
    });

    await waitFor(() => expect(screen.getByTestId("post-event")).toBeTruthy());
    expect(screen.getByTestId("event-registration-panel")).toBeTruthy();
  });

  it("post comum não mostra bloco de evento nem painel", async () => {
    mockGetPost.mockResolvedValue({
      id: "post-1",
      type: "announcement",
      title: "Aviso",
      body: "Corpo",
      media_url: null,
      published_at: "2026-09-01T00:00:00.000Z",
      created_at: "2026-08-30T00:00:00.000Z",
    });

    await act(async () => {
      render(<PostScreen />);
    });

    await waitFor(() => expect(screen.getByTestId("post-title")).toBeTruthy());
    expect(screen.queryByTestId("post-event")).toBeNull();
    expect(screen.queryByTestId("event-registration-panel")).toBeNull();
  });
});
