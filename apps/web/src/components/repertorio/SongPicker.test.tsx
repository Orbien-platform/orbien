import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SongPicker } from "./SongPicker";
import api from "@/lib/api";
import type { CatalogSong, SongVersion } from "@/lib/repertorio";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

function version(overrides: Partial<SongVersion> = {}): SongVersion {
  return {
    id: "v1",
    label: "Original",
    key: "D",
    bpm: 80,
    link: null,
    youtube_link: null,
    spotify_link: null,
    cifra_club_link: null,
    notes: null,
    last_played_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

/** `key`/`bpm`/`last_played_at` configuram a versão única; `versions` sobrescreve. */
function song(
  overrides: Partial<Pick<CatalogSong, "id" | "title" | "versions">> &
    Partial<Pick<SongVersion, "key" | "bpm" | "last_played_at" | "link" | "youtube_link">> = {},
): CatalogSong {
  const { id = "s1", title = "Grande é o Senhor", versions, ...fields } = overrides;
  return {
    id,
    title,
    last_played_at: fields.last_played_at ?? "2026-08-01T12:00:00.000Z",
    versions: versions ?? [version({ id: `v-${id}`, ...fields })],
  };
}

function mockGet(list: CatalogSong[] | null = [song()]) {
  vi.mocked(api.get).mockResolvedValue({ data: list } as never);
}

describe("SongPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("música de uma versão: título, versão com tom e BPM e última vez tocada", async () => {
    mockGet();
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(await screen.findByText("Grande é o Senhor")).toBeInTheDocument();
    expect(screen.getByText("Original · Tom D · 80 BPM")).toBeInTheDocument();
    expect(screen.getByText("Tocada em: 01/08/2026")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/songs");
  });

  it("versão sem tom nem BPM mostra só o nome e 'nunca tocada'", async () => {
    mockGet([song({ key: null, bpm: null, last_played_at: null })]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(await screen.findByText("Original")).toBeInTheDocument();
    expect(screen.getByText("Tocada em: nunca tocada")).toBeInTheDocument();
    expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
  });

  it("música com várias versões lista cada uma, com o seu tom e BPM", async () => {
    mockGet([
      song({
        title: "Digno é o Senhor",
        versions: [
          version({ id: "v1", label: "Original", key: "E", bpm: 90 }),
          version({ id: "v2", label: "Acústica", key: "G", bpm: 66, last_played_at: null }),
        ],
      }),
    ]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(await screen.findByText("Digno é o Senhor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Digno é o Senhor — Original" })).toHaveTextContent(
      "Tom E",
    );
    expect(screen.getByRole("button", { name: "Digno é o Senhor — Acústica" })).toHaveTextContent(
      "Tom G",
    );
    expect(screen.getByText("66 BPM")).toBeInTheDocument();
  });

  it("mostra o esqueleto de carga antes da resposta", async () => {
    let resolve: (v: unknown) => void = () => {};
    vi.mocked(api.get).mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    const { container } = render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    resolve({ data: [song()] });
    expect(await screen.findByText("Grande é o Senhor")).toBeInTheDocument();
  });

  it("filtra por parte do título ignorando caixa e acento (SETREP-02 AC2)", async () => {
    mockGet([song({ id: "s1", title: "Orações" }), song({ id: "s2", title: "Aleluia" })]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);
    await screen.findByText("Orações");

    await userEvent.type(screen.getByPlaceholderText("Buscar no repertório…"), "oracoes");

    await waitFor(() => expect(screen.queryByText("Aleluia")).not.toBeInTheDocument());
    expect(screen.getByText("Orações")).toBeInTheDocument();
  });

  it("termo só com espaço volta à lista não filtrada (Edge Case)", async () => {
    mockGet([song({ id: "s1", title: "Orações" }), song({ id: "s2", title: "Aleluia" })]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);
    const input = await screen.findByPlaceholderText("Buscar no repertório…");

    await userEvent.type(input, "   ");

    await waitFor(() => expect(screen.getByText("Aleluia")).toBeInTheDocument());
    expect(screen.getByText("Orações")).toBeInTheDocument();
  });

  it("busca sem resultado mantém o campo de busca e o caminho de cadastro (SETREP-02 AC3)", async () => {
    mockGet([song({ title: "Aleluia" })]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);
    const input = await screen.findByPlaceholderText("Buscar no repertório…");

    await userEvent.type(input, "zzz");

    expect(await screen.findByText("Nenhuma música encontrada para essa busca.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar no repertório…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cadastrar música no repertório/ })).toBeInTheDocument();
  });

  it("catálogo vazio informa a ausência e oferece cadastro (SETREP-02 AC5)", async () => {
    mockGet([]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(
      await screen.findByText("Nenhuma música no repertório desta congregação."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cadastrar música no repertório/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar no repertório…")).toBeInTheDocument();
  });

  it("resposta fora do formato de lista não quebra o seletor (SETREP-02 AC6)", async () => {
    mockGet(null);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(
      await screen.findByText("Nenhuma música no repertório desta congregação."),
    ).toBeInTheDocument();
  });

  it("erro de carga mostra a mensagem da API sem esconder o campo de busca (SETREP-02 AC6)", async () => {
    vi.mocked(api.get).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: "Catálogo indisponível" } },
    } as never);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(await screen.findByText("Catálogo indisponível")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar no repertório…")).toBeInTheDocument();
  });

  it("escolher chama onSelect com a música inteira e a versão escolhida", async () => {
    const chosen = song({ youtube_link: "https://yt/x", link: "https://cifra/x" });
    mockGet([chosen]);
    const onSelect = vi.fn();
    render(<SongPicker canCreate onSelect={onSelect} debounce={0} />);

    await userEvent.click(await screen.findByRole("button", { name: /Grande é o Senhor/ }));

    expect(onSelect).toHaveBeenCalledWith(chosen, chosen.versions[0]);
  });

  it("escolher uma das versões entrega aquela versão, não a primeira", async () => {
    const multi = song({
      title: "Digno é o Senhor",
      versions: [
        version({ id: "v1", label: "Original" }),
        version({ id: "v2", label: "Acústica", key: "G" }),
      ],
    });
    mockGet([multi]);
    const onSelect = vi.fn();
    render(<SongPicker canCreate onSelect={onSelect} debounce={0} />);

    await userEvent.click(await screen.findByRole("button", { name: "Digno é o Senhor — Acústica" }));

    expect(onSelect).toHaveBeenCalledWith(multi, multi.versions[1]);
  });

  it("duas músicas de mesmo título ficam distinguíveis por tom, BPM e última vez (Edge Case)", async () => {
    mockGet([
      song({ id: "s1", title: "Aleluia", key: "D", bpm: 80, last_played_at: null }),
      song({ id: "s2", title: "Aleluia", key: "G", bpm: 120, last_played_at: "2026-08-01T12:00:00.000Z" }),
    ]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(await screen.findAllByText("Aleluia")).toHaveLength(2);
    expect(screen.getByText("Original · Tom D · 80 BPM")).toBeInTheDocument();
    expect(screen.getByText("Original · Tom G · 120 BPM")).toBeInTheDocument();
    expect(screen.getByText("Tocada em: nunca tocada")).toBeInTheDocument();
    expect(screen.getByText("Tocada em: 01/08/2026")).toBeInTheDocument();
  });

  it("título longo é truncado em vez de quebrar o layout (Edge Case)", async () => {
    const longo = "Grande é o Senhor e muito digno de louvor na cidade do nosso Deus".repeat(2);
    mockGet([song({ title: longo })]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect((await screen.findByText(longo)).className).toContain("truncate");
  });

  it("canCreate falso esconde o cadastro sem impedir buscar e escolher (SETREP-03 AC5)", async () => {
    mockGet();
    const onSelect = vi.fn();
    render(<SongPicker canCreate={false} onSelect={onSelect} debounce={0} />);

    await screen.findByText("Grande é o Senhor");
    expect(screen.queryByRole("button", { name: /Cadastrar música no repertório/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Grande é o Senhor/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("abre e fecha a área de cadastro pelo atalho do seletor (SETREP-03 AC1)", async () => {
    mockGet();
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);
    await screen.findByText("Grande é o Senhor");

    await userEvent.click(screen.getByRole("button", { name: /Cadastrar música no repertório/ }));
    expect(screen.getByText("Nova música no repertório")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Voltar para a busca" }));
    expect(screen.getByText("Grande é o Senhor")).toBeInTheDocument();
  });

  describe("cadastro inline", () => {
    async function openCreate() {
      mockGet([]);
      const onSelect = vi.fn();
      render(<SongPicker canCreate onSelect={onSelect} debounce={0} />);
      await screen.findByText("Nenhuma música no repertório desta congregação.");
      await userEvent.click(screen.getByRole("button", { name: /Cadastrar música no repertório/ }));
      return onSelect;
    }

    it("oferece título e os campos da primeira versão — sem tom alternativo", async () => {
      await openCreate();

      expect(screen.getByLabelText("Título")).toBeInTheDocument();
      expect(screen.getByLabelText("Nome da versão")).toHaveValue("Original");
      expect(screen.getByLabelText("Tom")).toBeInTheDocument();
      expect(screen.queryByLabelText("Tom alternativo")).not.toBeInTheDocument();
      expect(screen.getByLabelText("BPM")).toBeInTheDocument();
      expect(screen.getByLabelText("Outro link (opcional)")).toBeInTheDocument();
      expect(screen.getByLabelText("Link do YouTube")).toBeInTheDocument();
      expect(screen.getByLabelText("Link do Spotify")).toBeInTheDocument();
      expect(screen.getByLabelText("Link do Cifra Club")).toBeInTheDocument();
    });

    it("cria a música via POST /songs com a versão inicial", async () => {
      const onSelect = await openCreate();
      vi.mocked(api.post).mockResolvedValue({
        data: { id: "novo", title: "Grande é o Senhor", versions: [version({ id: "vn" })] },
      } as never);

      await userEvent.type(screen.getByLabelText("Título"), "  Grande é o Senhor  ");
      await userEvent.type(screen.getByLabelText("Tom"), "D");
      await userEvent.type(screen.getByLabelText("BPM"), "80");
      await userEvent.type(screen.getByLabelText("Outro link (opcional)"), "https://cifra/x");
      await userEvent.type(screen.getByLabelText("Link do YouTube"), "https://yt/x");
      await userEvent.type(screen.getByLabelText("Link do Spotify"), "https://spotify/x");
      await userEvent.type(screen.getByLabelText("Link do Cifra Club"), "https://cifraclub/x");
      await userEvent.click(screen.getByRole("button", { name: "Criar e usar" }));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith("/songs", {
          title: "Grande é o Senhor",
          version: {
            label: "Original",
            key: "D",
            bpm: 80,
            link: "https://cifra/x",
            youtube_link: "https://yt/x",
            spotify_link: "https://spotify/x",
            cifra_club_link: "https://cifraclub/x",
          },
        }),
      );
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("seleciona a música criada, com a versão criada e last_played_at nulo", async () => {
      const onSelect = await openCreate();
      const created = version({ id: "vn", key: "D", bpm: null });
      vi.mocked(api.post).mockResolvedValue({
        data: { id: "novo", title: "Grande é o Senhor", versions: [created] },
      } as never);

      await userEvent.type(screen.getByLabelText("Título"), "Grande é o Senhor");
      await userEvent.click(screen.getByRole("button", { name: "Criar e usar" }));

      const expectedVersion = { ...created, last_played_at: null };
      await waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith(
          {
            id: "novo",
            title: "Grande é o Senhor",
            last_played_at: null,
            versions: [expectedVersion],
          },
          expectedVersion,
        ),
      );
    });

    it("versão sem nome bloqueia o envio sem chamar a API", async () => {
      await openCreate();

      await userEvent.type(screen.getByLabelText("Título"), "Digno é o Senhor");
      await userEvent.clear(screen.getByLabelText("Nome da versão"));
      await userEvent.click(screen.getByRole("button", { name: "Criar e usar" }));

      expect(await screen.findByText("Dê um nome à versão.")).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("título só com espaço bloqueia o envio sem chamar a API (SETREP-03 AC3)", async () => {
      await openCreate();

      await userEvent.type(screen.getByLabelText("Título"), "   ");
      await userEvent.click(screen.getByRole("button", { name: "Criar e usar" }));

      expect(await screen.findByText("Dê um título à música.")).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("erro 4xx do POST mostra a mensagem da API e preserva o digitado (SETREP-03 AC4)", async () => {
      await openCreate();
      vi.mocked(api.post).mockRejectedValue({
        isAxiosError: true,
        response: { status: 403, data: { message: "Você não tem permissão." } },
      } as never);

      await userEvent.type(screen.getByLabelText("Título"), "Digno é o Senhor");
      await userEvent.click(screen.getByRole("button", { name: "Criar e usar" }));

      expect(await screen.findByText("Você não tem permissão.")).toBeInTheDocument();
      expect(screen.getByLabelText("Título")).toHaveValue("Digno é o Senhor");
    });

    it("erro 5xx do POST cai na mensagem da tela (SETREP-03 AC4)", async () => {
      await openCreate();
      vi.mocked(api.post).mockRejectedValue({
        isAxiosError: true,
        response: { status: 500, data: { statusCode: 500, message: "Internal server error" } },
      } as never);

      await userEvent.type(screen.getByLabelText("Título"), "Digno é o Senhor");
      await userEvent.click(screen.getByRole("button", { name: "Criar e usar" }));

      expect(await screen.findByText("Não foi possível salvar a música.")).toBeInTheDocument();
      expect(screen.queryByText("Internal server error")).not.toBeInTheDocument();
    });

    it("mostra 'Salvando…' enquanto o POST está em voo", async () => {
      await openCreate();
      let resolve: (v: unknown) => void = () => {};
      vi.mocked(api.post).mockReturnValue(new Promise((r) => { resolve = r; }) as never);

      await userEvent.type(screen.getByLabelText("Título"), "Digno é o Senhor");
      await userEvent.click(screen.getByRole("button", { name: "Criar e usar" }));

      expect(await screen.findByRole("button", { name: "Salvando…" })).toBeInTheDocument();
      resolve({ data: { id: "novo", title: "Digno é o Senhor", versions: [version()] } });
    });

    it("volta para a busca sem criar nada", async () => {
      await openCreate();

      await userEvent.click(screen.getByRole("button", { name: "Voltar para a busca" }));

      expect(screen.getByPlaceholderText("Buscar no repertório…")).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  it("oferece cancelar quando o consumidor passa onCancel", async () => {
    mockGet();
    const onCancel = vi.fn();
    render(<SongPicker canCreate onSelect={vi.fn()} onCancel={onCancel} debounce={0} />);

    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
