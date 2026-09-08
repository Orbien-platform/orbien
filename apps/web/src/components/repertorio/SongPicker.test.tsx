import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SongPicker } from "./SongPicker";
import api from "@/lib/api";
import type { CatalogSong } from "@/lib/repertorio";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

function song(overrides: Partial<CatalogSong> = {}): CatalogSong {
  return {
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
    last_played_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function mockGet(list: CatalogSong[] | null = [song()]) {
  vi.mocked(api.get).mockResolvedValue({ data: list } as never);
}

describe("SongPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista título, tom, BPM e última vez tocada (SETREP-02 AC1)", async () => {
    mockGet();
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(await screen.findByText("Grande é o Senhor")).toBeInTheDocument();
    expect(screen.getByText("Tom D")).toBeInTheDocument();
    expect(screen.getByText("80 BPM")).toBeInTheDocument();
    expect(screen.getByText("Última vez tocada: 01/08/2026")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/songs");
  });

  it("usa key_alt quando key é nulo e mostra 'nunca tocada' (SETREP-02 AC1)", async () => {
    mockGet([song({ key: null, key_alt: "E", bpm: null, last_played_at: null })]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(await screen.findByText("Tom E")).toBeInTheDocument();
    expect(screen.getByText("Última vez tocada: nunca tocada")).toBeInTheDocument();
    expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
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

  it("escolher uma música chama onSelect com o CatalogSong inteiro (SETREP-02 AC4)", async () => {
    const chosen = song({ youtube_link: "https://yt/x", link: "https://cifra/x" });
    mockGet([chosen]);
    const onSelect = vi.fn();
    render(<SongPicker canCreate onSelect={onSelect} debounce={0} />);

    await userEvent.click(await screen.findByRole("button", { name: /Grande é o Senhor/ }));

    expect(onSelect).toHaveBeenCalledWith(chosen);
  });

  it("duas músicas de mesmo título ficam distinguíveis por tom, BPM e última vez (Edge Case)", async () => {
    mockGet([
      song({ id: "s1", title: "Aleluia", key: "D", bpm: 80, last_played_at: null }),
      song({ id: "s2", title: "Aleluia", key: "G", bpm: 120, last_played_at: "2026-08-01T12:00:00.000Z" }),
    ]);
    render(<SongPicker canCreate onSelect={vi.fn()} debounce={0} />);

    expect(await screen.findAllByText("Aleluia")).toHaveLength(2);
    expect(screen.getByText("Tom D")).toBeInTheDocument();
    expect(screen.getByText("Tom G")).toBeInTheDocument();
    expect(screen.getByText("80 BPM")).toBeInTheDocument();
    expect(screen.getByText("120 BPM")).toBeInTheDocument();
    expect(screen.getByText("Última vez tocada: nunca tocada")).toBeInTheDocument();
    expect(screen.getByText("Última vez tocada: 01/08/2026")).toBeInTheDocument();
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

  it("oferece cancelar quando o consumidor passa onCancel", async () => {
    mockGet();
    const onCancel = vi.fn();
    render(<SongPicker canCreate onSelect={vi.fn()} onCancel={onCancel} debounce={0} />);

    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
