// Testes de PostScreen (MOB-07, T7 do tasks.md).
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

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
    expect(screen.getByText("Não perca o culto de domingo.")).toBeTruthy();
  });

  it("corpo em Markdown sai formatado, sem os símbolos crus", async () => {
    mockGetPost.mockResolvedValue({
      id: "post-1",
      type: "announcement",
      title: "Culto especial",
      body: "## Programação\n\n- **Louvor** às 19h\n- Palavra",
      media_url: null,
      published_at: "2026-09-01T00:00:00.000Z",
      created_at: "2026-08-30T00:00:00.000Z",
    });

    await act(async () => {
      render(<PostScreen />);
    });

    await waitFor(() => screen.getByText("Programação"));
    expect(screen.getByText("Louvor")).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(screen.queryByText(/##/)).toBeNull();
  });

  it("imagem vira capa; PDF vira link 'Abrir anexo' em vez de imagem quebrada", async () => {
    mockGetPost.mockResolvedValue({
      id: "post-1",
      type: "announcement",
      title: "Boletim",
      body: null,
      media_url: "https://cdn/x/boletim.pdf",
      published_at: "2026-09-01T00:00:00.000Z",
      created_at: "2026-08-30T00:00:00.000Z",
    });

    await act(async () => {
      render(<PostScreen />);
    });

    await waitFor(() => screen.getByTestId("post-attachment"));
    expect(screen.queryByTestId("post-media")).toBeNull();
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

  it("ignora a resposta que chega depois de a tela desmontar", async () => {
    let resolve!: (value: unknown) => void;
    mockGetPost.mockReturnValue(new Promise((r) => (resolve = r)));

    const view = await render(<PostScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      resolve(EVENT_POST);
    });

    expect(mockGetPost).toHaveBeenCalled();
  });

  it("ignora a falha que chega depois de a tela desmontar", async () => {
    let reject!: (reason: unknown) => void;
    mockGetPost.mockReturnValue(new Promise((_, r) => (reject = r)));

    const view = await render(<PostScreen />);
    await act(async () => {
      view.unmount();
    });
    await act(async () => {
      reject(new Error("falha de rede"));
    });

    expect(mockGetPost).toHaveBeenCalled();
  });

  it("imagem vira capa no topo do post", async () => {
    mockGetPost.mockResolvedValue({ ...EVENT_POST, media_url: "https://cdn/x/capa.jpg" });

    await render(<PostScreen />);

    expect(await screen.findByTestId("post-media")).toBeTruthy();
    expect(screen.queryByTestId("post-attachment")).toBeNull();
  });

  it("tocar em 'Abrir anexo' abre o arquivo e engole a falha do openURL", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("sem app"));
    mockGetPost.mockResolvedValue({ ...EVENT_POST, media_url: "https://cdn/x/boletim.pdf" });

    await render(<PostScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByTestId("post-attachment"));
    });

    expect(openURL).toHaveBeenCalledWith("https://cdn/x/boletim.pdf");
    openURL.mockRestore();
  });

  it("evento só com local mostra o local sem a linha de data, e só com data sem a de local", async () => {
    mockGetPost.mockResolvedValue({ ...EVENT_POST, event_starts_at: null });
    const soLocal = await render(<PostScreen />);
    expect(await screen.findByTestId("post-event-location")).toBeTruthy();
    expect(screen.queryByTestId("post-event-date")).toBeNull();
    await act(async () => {
      soLocal.unmount();
    });

    mockGetPost.mockResolvedValue({ ...EVENT_POST, event_location: null });
    await render(<PostScreen />);
    expect(await screen.findByTestId("post-event-date")).toBeTruthy();
    expect(screen.queryByTestId("post-event-location")).toBeNull();
  });
});
