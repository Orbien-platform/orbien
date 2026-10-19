import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SongCatalogPanel, type CatalogSong } from "./SongCatalogPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const songs: CatalogSong[] = [
  {
    id: "s1",
    title: "Grande é o Senhor",
    last_played_at: "2026-08-01T00:00:00.000Z",
    versions: [
      {
        id: "v1",
        label: "Original",
        key: "D",
        bpm: 80,
        link: null,
        youtube_link: null,
        spotify_link: null,
        cifra_club_link: null,
        notes: null,
        last_played_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "v2",
        label: "Acústica",
        key: "A",
        bpm: 66,
        link: null,
        youtube_link: "https://youtube.com/watch?v=ac",
        spotify_link: null,
        cifra_club_link: null,
        notes: null,
        last_played_at: null,
      },
    ],
  },
];

function mockGet(list = songs) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/songs") return Promise.resolve({ data: list });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("SongCatalogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists each song with its versions, each with its own key and bpm", async () => {
    mockGet();
    render(<SongCatalogPanel canEdit={true} />);

    expect(await screen.findByText("Grande é o Senhor")).toBeInTheDocument();
    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(screen.getByText("Acústica")).toBeInTheDocument();
    expect(screen.getByText("Tom D")).toBeInTheDocument();
    expect(screen.getByText("Tom A")).toBeInTheDocument();
    expect(screen.getByText("80 BPM")).toBeInTheDocument();
    expect(screen.getByText("66 BPM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "YouTube" })).toHaveAttribute(
      "href",
      "https://youtube.com/watch?v=ac",
    );
    // 2026-08-01T00:00:00Z é 31/07 às 21h em Brasília — e 01/08 em Tóquio,
    // onde este teste roda. O valor exibido é o de Brasília, sempre.
    expect(screen.getByText(/Última vez tocada: 31\/07\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Tocada em: 31\/07\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Tocada em: nunca tocada/)).toBeInTheDocument();
    expect(screen.getByText("1 música no repertório")).toBeInTheDocument();
  });

  it("shows 'nunca tocada' when last_played_at is null", async () => {
    mockGet([{ ...songs[0], last_played_at: null }]);
    render(<SongCatalogPanel canEdit={true} />);
    expect(await screen.findByText(/Última vez tocada: nunca tocada/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no songs", async () => {
    mockGet([]);
    render(<SongCatalogPanel canEdit={true} />);
    expect(await screen.findByText("Nenhuma música cadastrada.")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: false });
    render(<SongCatalogPanel canEdit={true} />);
    expect(
      await screen.findByText("Não foi possível carregar o repertório.")
    ).toBeInTheDocument();
  });

  it("não mostra 'Internal server error' quando a API responde 500", async () => {
    // O bug relatado no menu Repertório: o corpo padrão do Nest chegava
    // inteiro à tela porque o componente repassava err.response.data.message.
    vi.mocked(api.get).mockRejectedValue(
      Object.assign(new Error("Request failed with status code 500"), {
        isAxiosError: true,
        response: { status: 500, data: { statusCode: 500, message: "Internal server error" } },
      })
    );
    render(<SongCatalogPanel canEdit={true} />);

    expect(
      await screen.findByText("Não foi possível carregar o repertório.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Internal server error")).not.toBeInTheDocument();
  });

  it("recarrega a lista ao clicar em 'Tentar novamente'", async () => {
    vi.mocked(api.get).mockRejectedValueOnce({ isAxiosError: false });
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Não foi possível carregar o repertório.");

    mockGet();
    await userEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }));

    expect(await screen.findByText("Grande é o Senhor")).toBeInTheDocument();
    expect(
      screen.queryByText("Não foi possível carregar o repertório.")
    ).not.toBeInTheDocument();
  });

  it("does not show create/edit/remove actions when canEdit is false", async () => {
    mockGet();
    render(<SongCatalogPanel canEdit={false} />);
    await screen.findByText("Grande é o Senhor");
    expect(screen.queryByRole("button", { name: "Nova música" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar|Renomear|Nova versão/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
  });

  it("validates required title when creating a song", async () => {
    mockGet();
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Nova música" }));
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(await screen.findByText("Dê um título à música.")).toBeInTheDocument();
  });

  it("creates a song with its first version", async () => {
    // Timeout maior que o default (5s): campos digitados via user.type levam
    // mais que isso na máquina mais lenta do CI (mesmo padrão usado em
    // ServiceOrderView.test.tsx para o formulário de Adicionar Item).
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Nova música" }));
    // Não existe mais "Tom alternativo": cada versão tem o seu tom.
    expect(screen.queryByLabelText("Tom alternativo")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Título"), "Digno é o Senhor");
    expect(screen.getByLabelText("Nome da versão")).toHaveValue("Original");
    await user.type(screen.getByLabelText("Tom"), "E");
    await user.type(screen.getByLabelText("BPM"), "90");
    await user.type(screen.getByLabelText("Link do YouTube"), "https://youtube.com/watch?v=x");
    await user.type(screen.getByLabelText("Link do Spotify"), "https://open.spotify.com/track/x");
    await user.type(screen.getByLabelText("Link do Cifra Club"), "https://cifraclub.com.br/x");
    await user.type(screen.getByLabelText("Outro link (opcional)"), "https://cifra.example/x");
    await user.type(screen.getByLabelText("Notas (opcional)"), "tocar mais lento");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/songs", {
        title: "Digno é o Senhor",
        version: {
          label: "Original",
          key: "E",
          bpm: 90,
          link: "https://cifra.example/x",
          youtube_link: "https://youtube.com/watch?v=x",
          spotify_link: "https://open.spotify.com/track/x",
          cifra_club_link: "https://cifraclub.com.br/x",
          notes: "tocar mais lento",
        },
      })
    );
  }, 10000);

  it("renames a song without touching its versions", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Renomear Grande é o Senhor" }));
    const title = await screen.findByLabelText("Título");
    expect(title).toHaveValue("Grande é o Senhor");
    expect(screen.queryByLabelText("Tom")).not.toBeInTheDocument();

    await user.clear(title);
    await user.type(title, "Grande é Deus");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/songs/s1", { title: "Grande é Deus" })
    );
  });

  it("adds a new version with its own key to an existing song", async () => {
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Nova versão de Grande é o Senhor" }));
    await user.click(screen.getByRole("button", { name: "Criar versão" }));
    expect(await screen.findByText("Dê um nome à versão.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nome da versão"), "Ao vivo");
    await user.type(screen.getByLabelText("Tom"), "B");
    await user.click(screen.getByRole("button", { name: "Criar versão" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/songs/s1/versions", {
        label: "Ao vivo",
        key: "B",
      })
    );
  });

  it("opens a version pre-filled and updates only that version", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(
      screen.getByRole("button", { name: "Editar versão Acústica de Grande é o Senhor" })
    );

    expect(await screen.findByDisplayValue("Acústica")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A")).toBeInTheDocument();
    expect(screen.getByDisplayValue("66")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/songs/s1/versions/v2",
        expect.objectContaining({ label: "Acústica", key: "A", bpm: 66 })
      )
    );
  });

  it("deletes a version, and hides delete when the song has only one", async () => {
    mockGet([
      songs[0],
      { ...songs[0], id: "s2", title: "Aleluia", versions: [songs[0].versions[0]] },
    ]);
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Aleluia");

    expect(
      screen.queryByRole("button", { name: "Excluir versão Original de Aleluia" })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Excluir versão Acústica de Grande é o Senhor" })
    );
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/songs/s1/versions/v2"));
  });

  it("shows an error from the API when saving fails", async () => {
    mockGet();
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Link inválido." } },
    });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Nova música" }));
    await user.type(screen.getByLabelText("Título"), "Digno é o Senhor");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(await screen.findByText("Link inválido.")).toBeInTheDocument();
  });

  it("deletes a song", async () => {
    mockGet();
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Excluir Grande é o Senhor" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/songs/s1"));
  });

  it("shows an error message when deleting a version fails", async () => {
    mockGet();
    vi.mocked(api.delete).mockRejectedValue({ isAxiosError: false });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(
      screen.getByRole("button", { name: "Excluir versão Acústica de Grande é o Senhor" })
    );

    expect(await screen.findByText("Não foi possível excluir a versão.")).toBeInTheDocument();
  });

  it("closes the form with Escape", async () => {
    mockGet();
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Nova música" }));
    expect(await screen.findByRole("heading", { name: "Nova música" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Nova música" })).not.toBeInTheDocument()
    );
  });

  it("shows an error message when deleting a song fails", async () => {
    mockGet();
    vi.mocked(api.delete).mockRejectedValue({ isAxiosError: false });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Excluir Grande é o Senhor" }));

    expect(
      await screen.findByText("Não foi possível excluir a música.")
    ).toBeInTheDocument();
  });

  it("closes the form via the Cancelar button", async () => {
    mockGet();
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Nova música" }));
    expect(await screen.findByRole("heading", { name: "Nova música" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("heading", { name: "Nova música" })).not.toBeInTheDocument();
  });

  it("ignores the songs response if the component unmounts before it resolves", async () => {
    let resolveGet!: (value: { data: typeof songs }) => void;
    vi.mocked(api.get).mockImplementation(() => new Promise((resolve) => { resolveGet = resolve; }));
    const { unmount } = render(<SongCatalogPanel canEdit={true} />);
    unmount();

    resolveGet({ data: songs });
    await Promise.resolve();
    await Promise.resolve();
  });

  it("ignores a stale error if the component unmounts before the request rejects", async () => {
    let rejectGet!: (err: unknown) => void;
    vi.mocked(api.get).mockImplementation(() => new Promise((_resolve, reject) => { rejectGet = reject; }));
    const { unmount } = render(<SongCatalogPanel canEdit={true} />);
    unmount();

    rejectGet(new Error("falha de rede"));
    await Promise.resolve();
    await Promise.resolve();
  });

  it("lists a version without key or bpm, and edits it without pre-filling those fields", async () => {
    const bare: CatalogSong = {
      id: "s2",
      title: "Aleluia",
      last_played_at: null,
      versions: [
        {
          id: "v9",
          label: "Original",
          key: null,
          bpm: null,
          link: null,
          youtube_link: null,
          spotify_link: null,
          cifra_club_link: null,
          notes: null,
          last_played_at: null,
        },
      ],
    };
    mockGet([bare]);
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);

    await screen.findByText("Aleluia");
    expect(screen.queryByText(/^Tom /)).not.toBeInTheDocument();
    expect(screen.queryByText(/ BPM$/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar versão Original de Aleluia" }));
    expect(await screen.findByDisplayValue("Original")).toBeInTheDocument();
    expect(screen.getByLabelText("Tom")).toHaveValue("");
    expect(screen.getByLabelText("BPM")).toHaveValue(null);
  });

  it("falls back to an empty list when the response isn't an array", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null as unknown as CatalogSong[] });
    render(<SongCatalogPanel canEdit={true} />);
    expect(await screen.findByText("Nenhuma música cadastrada.")).toBeInTheDocument();
  });
});
