import { render, screen, within } from "@testing-library/react";
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
});
