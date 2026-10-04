import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppHighlightsPanel } from "./AppHighlightsPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));

const posts = [
  { id: "a", title: "Culto de domingo", is_draft: false, published_at: "2026-09-01T00:00:00Z", media_url: "https://cdn/a.jpg", app_highlight_position: 1 },
  { id: "b", title: "Retiro", is_draft: false, published_at: "2026-09-02T00:00:00Z", media_url: null, app_highlight_position: 0 },
  { id: "c", title: "Rascunho novo", is_draft: true, published_at: null, media_url: null, app_highlight_position: null },
];

describe("AppHighlightsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((_url: string, config?: { params?: unknown }) =>
      Promise.resolve({
        data: {
          data: (config?.params as { highlighted?: boolean } | undefined)?.highlighted
            ? posts.filter((p) => p.app_highlight_position != null)
            : posts,
        },
      }) as never,
    );
    vi.mocked(api.put).mockResolvedValue({ data: [] });
  });

  it("lista os destaques na ordem gravada e os demais em 'Outros posts'", async () => {
    render(<AppHighlightsPanel canEdit />);

    const items = await screen.findAllByTestId(/^highlight-/);
    expect(items.map((i) => i.getAttribute("data-testid"))).toEqual(["highlight-b", "highlight-a"]);
    expect(screen.getByText("Rascunho novo")).toBeInTheDocument();
    expect(screen.getByText(/Não publicado/)).toBeInTheDocument();
  });

  it("reordena, adiciona e salva a lista inteira na nova ordem", async () => {
    const user = userEvent.setup();
    render(<AppHighlightsPanel canEdit />);

    const second = await screen.findByTestId("highlight-a");
    await user.click(within(second).getByRole("button", { name: "Subir" }));
    await user.click(screen.getByRole("button", { name: "Pôr em destaque" }));
    await user.click(screen.getByRole("button", { name: "Salvar destaques" }));

    expect(api.put).toHaveBeenCalledWith("/content/posts/highlights", { post_ids: ["a", "b", "c"] });
    expect(await screen.findByRole("status")).toHaveTextContent("Destaques salvos");
  });

  it("tirar do destaque e salvar manda a lista sem ele", async () => {
    const user = userEvent.setup();
    render(<AppHighlightsPanel canEdit />);

    const first = await screen.findByTestId("highlight-b");
    await user.click(within(first).getByRole("button", { name: "Tirar do destaque" }));
    await user.click(screen.getByRole("button", { name: "Salvar destaques" }));

    expect(api.put).toHaveBeenCalledWith("/content/posts/highlights", { post_ids: ["a"] });
  });

  it("sem permissão de escrita, só mostra a lista", async () => {
    render(<AppHighlightsPanel canEdit={false} />);

    await screen.findByTestId("highlight-b");
    expect(screen.queryByRole("button", { name: "Salvar destaques" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subir" })).not.toBeInTheDocument();
  });

  it("destaque fora dos 100 mais recentes continua na lista (vem de highlighted=true)", async () => {
    const antigo = { ...posts[0]!, id: "velho", title: "Destaque antigo", app_highlight_position: 2 };
    vi.mocked(api.get).mockImplementation((_url: string, config?: { params?: unknown }) =>
      Promise.resolve({
        data: { data: (config?.params as { highlighted?: boolean } | undefined)?.highlighted ? [antigo] : posts.filter((p) => p.id === "c") },
      }) as never,
    );

    render(<AppHighlightsPanel canEdit />);

    expect(await screen.findByTestId("highlight-velho")).toBeInTheDocument();
    expect(screen.getByText("Rascunho novo")).toBeInTheDocument();
  });

  it("falha ao carregar mostra erro — não 'nenhum destaque' — e não deixa salvar", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));

    render(<AppHighlightsPanel canEdit={false} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByText("Nenhum post em destaque.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar destaques" })).not.toBeInTheDocument();
  });

  it("descer troca com o de baixo; nos extremos o botão fica desabilitado", async () => {
    const user = userEvent.setup();
    render(<AppHighlightsPanel canEdit />);

    const first = await screen.findByTestId("highlight-b");
    expect(within(first).getByRole("button", { name: "Subir" })).toBeDisabled();
    await user.click(within(first).getByRole("button", { name: "Descer" }));

    const items = screen.getAllByTestId(/^highlight-/);
    expect(items.map((i) => i.getAttribute("data-testid"))).toEqual(["highlight-a", "highlight-b"]);
    expect(within(items[1]!).getByRole("button", { name: "Descer" })).toBeDisabled();
  });

  it("falha ao salvar mostra o erro e mantém a lista editada", async () => {
    vi.mocked(api.put).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<AppHighlightsPanel canEdit />);

    const first = await screen.findByTestId("highlight-b");
    await user.click(within(first).getByRole("button", { name: "Tirar do destaque" }));
    await user.click(screen.getByRole("button", { name: "Salvar destaques" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Não foi possível salvar");
    expect(screen.queryByTestId("highlight-b")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar destaques" })).toBeEnabled();
  });

  it("resposta sem `data` vira lista vazia, sem quebrar", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as never);
    render(<AppHighlightsPanel canEdit />);

    expect(await screen.findByText("Nenhum post em destaque.")).toBeInTheDocument();
    expect(screen.getByText("Todos os posts já estão no carrossel.")).toBeInTheDocument();
  });

  it("carrossel cheio desabilita 'Pôr em destaque'", async () => {
    const cheios = Array.from({ length: 10 }, (_, i) => ({
      ...posts[0]!, id: `h${i}`, title: `H${i}`, app_highlight_position: i,
    }));
    vi.mocked(api.get).mockImplementation((_url: string, config?: { params?: unknown }) =>
      Promise.resolve({
        data: {
          data: (config?.params as { highlighted?: boolean } | undefined)?.highlighted
            ? cheios
            : [...cheios, posts[2]!],
        },
      }) as never,
    );
    render(<AppHighlightsPanel canEdit />);

    expect(await screen.findByText("No carrossel (10/10)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pôr em destaque" })).toBeDisabled();
  });

  it("desmontar antes da resposta não atualiza estado (sucesso e falha)", async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    const ok = render(<AppHighlightsPanel canEdit />);
    ok.unmount();
    await act(async () => resolve({ data: { data: posts } }));

    let reject!: (e: unknown) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((_r, j) => { reject = j; }) as never);
    const fail = render(<AppHighlightsPanel canEdit />);
    fail.unmount();
    await act(async () => reject(new Error("boom")));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
