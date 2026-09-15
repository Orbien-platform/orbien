import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GroupGenealogyTree } from "./GroupGenealogyTree";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
}));

describe("GroupGenealogyTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza ancestrais e a árvore de descendentes com a cor de saúde por nó", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        ancestors: [
          { id: "a1", name: "Rede Central", leader_person_name: "Líder A", generation: -1, health_status: "green" },
        ],
        tree: {
          id: "b1",
          name: "Célula B",
          leader_person_name: "Líder B",
          generation: 0,
          health_status: "yellow",
          children: [
            {
              id: "c1",
              name: "Célula C",
              leader_person_name: "Líder C",
              generation: 1,
              health_status: "red",
              children: [],
            },
          ],
        },
      },
    });

    render(<GroupGenealogyTree groupId="b1" />);

    expect(await screen.findByText("Rede Central")).toBeInTheDocument();
    expect(screen.getByText("Célula B")).toBeInTheDocument();
    expect(screen.getByText("Célula C")).toBeInTheDocument();

    const dots = screen.getAllByRole("status");
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveClass("bg-teal");
    expect(dots[1]).toHaveClass("bg-amber-500");
    expect(dots[2]).toHaveClass("bg-crimson");
  });

  it("mostra 'sem descendentes' quando a célula é raiz isolada (AC2)", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        ancestors: [],
        tree: {
          id: "b1",
          name: "Célula Isolada",
          leader_person_name: null,
          generation: 0,
          health_status: "green",
          children: [],
        },
      },
    });

    render(<GroupGenealogyTree groupId="b1" />);

    expect(await screen.findByText("Célula Isolada")).toBeInTheDocument();
    expect(screen.queryByText("Ancestrais")).not.toBeInTheDocument();
  });

  it("mostra NoAccessState de tela cheia em 403 (sem Premium)", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });

    render(<GroupGenealogyTree groupId="b1" />);

    expect(await screen.findByText(/Você não tem acesso a Árvore genealógica/)).toBeInTheDocument();
  });

  it("mostra mensagem de falha quando a resposta não é 403 nem sucesso", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network down"));

    render(<GroupGenealogyTree groupId="b1" />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/small-groups/b1/hierarchy"));
    expect(
      await screen.findByText("Não foi possível carregar a árvore genealógica.")
    ).toBeInTheDocument();
  });
});
