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
    key: "D",
    key_alt: null,
    bpm: 80,
    link: null,
    youtube_link: null,
    spotify_link: null,
    cifra_club_link: null,
    notes: null,
    last_played_at: "2026-08-01T00:00:00.000Z",
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

  it("loads and lists songs with key, bpm and last played date", async () => {
    mockGet();
    render(<SongCatalogPanel canEdit={true} />);

    expect(await screen.findByText("Grande é o Senhor")).toBeInTheDocument();
    expect(screen.getByText("Tom D")).toBeInTheDocument();
    expect(screen.getByText("80 BPM")).toBeInTheDocument();
    expect(screen.getByText(/Última vez tocada: 01\/08\/2026/)).toBeInTheDocument();
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

  it("does not show create/edit/remove actions when canEdit is false", async () => {
    mockGet();
    render(<SongCatalogPanel canEdit={false} />);
    await screen.findByText("Grande é o Senhor");
    expect(screen.queryByRole("button", { name: "Nova música" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
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

  it("creates a song with all fields", async () => {
    mockGet();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Nova música" }));
    await user.type(screen.getByLabelText("Título"), "Digno é o Senhor");
    await user.type(screen.getByLabelText("Tom"), "E");
    await user.type(screen.getByLabelText("Tom alternativo"), "F#");
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
        key: "E",
        key_alt: "F#",
        bpm: 90,
        link: "https://cifra.example/x",
        youtube_link: "https://youtube.com/watch?v=x",
        spotify_link: "https://open.spotify.com/track/x",
        cifra_club_link: "https://cifraclub.com.br/x",
        notes: "tocar mais lento",
      })
    );
  });

  it("opens the edit form pre-filled and updates the song", async () => {
    mockGet();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);
    await screen.findByText("Grande é o Senhor");

    await user.click(screen.getByRole("button", { name: "Editar Grande é o Senhor" }));

    expect(await screen.findByDisplayValue("Grande é o Senhor")).toBeInTheDocument();
    expect(screen.getByDisplayValue("D")).toBeInTheDocument();
    expect(screen.getByDisplayValue("80")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/songs/s1",
        expect.objectContaining({ title: "Grande é o Senhor" })
      )
    );
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

  it("lists a song without key or bpm, and edits it without pre-filling those fields", async () => {
    const bare: CatalogSong = {
      id: "s2",
      title: "Aleluia",
      key: null,
      key_alt: null,
      bpm: null,
      link: null,
      youtube_link: null,
      spotify_link: null,
      cifra_club_link: null,
      notes: null,
      last_played_at: null,
    };
    mockGet([bare]);
    const user = userEvent.setup();
    render(<SongCatalogPanel canEdit={true} />);

    await screen.findByText("Aleluia");
    expect(screen.queryByText(/^Tom /)).not.toBeInTheDocument();
    expect(screen.queryByText(/ BPM$/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar Aleluia" }));
    expect(await screen.findByDisplayValue("Aleluia")).toBeInTheDocument();
    expect(screen.getByLabelText("Tom")).toHaveValue("");
    expect(screen.getByLabelText("BPM")).toHaveValue(null);
  });

  it("falls back to an empty list when the response isn't an array", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null as unknown as CatalogSong[] });
    render(<SongCatalogPanel canEdit={true} />);
    expect(await screen.findByText("Nenhuma música cadastrada.")).toBeInTheDocument();
  });
});
