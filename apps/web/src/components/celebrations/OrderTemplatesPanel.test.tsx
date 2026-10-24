import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderTemplatesPanel } from "./OrderTemplatesPanel";
import type { OrderTemplate } from "./OrderTemplateModals";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const steps = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `i${i + 1}`,
    name: `Etapa ${i + 1}`,
    sequence: i + 1,
    duration_minutes: 10,
    entry_kind: "program" as const,
  }));

const templates: OrderTemplate[] = [
  { id: "t1", name: "Culto de domingo", description: "Padrão semanal", items: steps(7) },
  { id: "t2", name: "Culto de oração", description: null, items: steps(2) },
];

describe("OrderTemplatesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: templates });
  });

  it("lista os moldes com resumo e as primeiras etapas", async () => {
    render(<OrderTemplatesPanel canEdit />);

    expect(await screen.findByText("Culto de domingo")).toBeInTheDocument();
    expect(screen.getByText("2 moldes de ordem de culto")).toBeInTheDocument();
    expect(screen.getByText("7 etapas · 70 min")).toBeInTheDocument();
    expect(screen.getByText("Padrão semanal")).toBeInTheDocument();
    expect(screen.getByText("Etapa 5")).toBeInTheDocument();
    expect(screen.queryByText("Etapa 6")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    // Sem "+N" quando todas as etapas cabem.
    expect(screen.getAllByText(/^\+\d+$/)).toHaveLength(1);
  });

  it("usa o singular com um molde só", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [templates[1]] });
    render(<OrderTemplatesPanel canEdit />);

    expect(await screen.findByText("1 molde de ordem de culto")).toBeInTheDocument();
  });

  it("explica de onde nasce o molde quando não há nenhum", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    render(<OrderTemplatesPanel canEdit />);

    expect(await screen.findByText("Nenhum molde de ordem de culto.")).toBeInTheDocument();
    expect(screen.getByText(/Salvar como molde/)).toBeInTheDocument();
  });

  it("trata resposta inesperada como lista vazia", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: null });
    render(<OrderTemplatesPanel canEdit />);

    expect(await screen.findByText("Nenhum molde de ordem de culto.")).toBeInTheDocument();
  });

  it("mostra o erro quando a lista não carrega", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("rede"));
    render(<OrderTemplatesPanel canEdit />);

    expect(await screen.findByText("Não foi possível carregar os moldes.")).toBeInTheDocument();
  });

  it("ignora a lista que chega depois de a tela ser desmontada", async () => {
    let resolveList: (v: { data: OrderTemplate[] }) => void = () => {};
    vi.mocked(api.get).mockReturnValue(new Promise((resolve) => (resolveList = resolve)));
    const { unmount } = render(<OrderTemplatesPanel canEdit />);

    unmount();
    resolveList({ data: templates });
    await new Promise((r) => setTimeout(r, 0));

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("ignora o erro que chega depois de a tela ser desmontada", async () => {
    let rejectList: (e: unknown) => void = () => {};
    vi.mocked(api.get).mockReturnValue(new Promise((_, reject) => (rejectList = reject)));
    const { unmount } = render(<OrderTemplatesPanel canEdit />);

    unmount();
    rejectList(new Error("rede"));
    await new Promise((r) => setTimeout(r, 0));

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("não mostra renomear nem excluir sem permissão de edição", async () => {
    render(<OrderTemplatesPanel canEdit={false} />);

    await screen.findByText("Culto de domingo");
    expect(screen.queryByRole("button", { name: /Renomear/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
  });

  it("renomeia o molde e recarrega a lista", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<OrderTemplatesPanel canEdit />);

    await user.click(await screen.findByRole("button", { name: "Renomear Culto de domingo" }));
    const name = screen.getByLabelText("Nome");
    expect(name).toHaveValue("Culto de domingo");
    expect(screen.getByLabelText("Descrição (opcional)")).toHaveValue("Padrão semanal");
    await user.clear(name);
    await user.type(name, "  Domingo ");
    await user.clear(screen.getByLabelText("Descrição (opcional)"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/celebrations/order-templates/t1", {
        name: "Domingo",
        description: "",
      }),
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument());
  });

  it("abre a edição de molde sem descrição com o campo vazio", async () => {
    const user = userEvent.setup();
    render(<OrderTemplatesPanel canEdit />);

    await user.click(await screen.findByRole("button", { name: "Renomear Culto de oração" }));

    expect(screen.getByLabelText("Descrição (opcional)")).toHaveValue("");
  });

  it("exige nome ao renomear", async () => {
    const user = userEvent.setup();
    render(<OrderTemplatesPanel canEdit />);

    await user.click(await screen.findByRole("button", { name: "Renomear Culto de domingo" }));
    await user.clear(screen.getByLabelText("Nome"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Dê um nome ao molde.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("mostra o erro de salvar e mantém o modal aberto", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("rede"));
    const user = userEvent.setup();
    render(<OrderTemplatesPanel canEdit />);

    await user.click(await screen.findByRole("button", { name: "Renomear Culto de domingo" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar o molde.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
  });

  it("fecha a edição pelo Cancelar sem salvar", async () => {
    const user = userEvent.setup();
    render(<OrderTemplatesPanel canEdit />);

    await user.click(await screen.findByRole("button", { name: "Renomear Culto de domingo" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument());
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("fecha a edição com Esc sem salvar", async () => {
    const user = userEvent.setup();
    render(<OrderTemplatesPanel canEdit />);

    await user.click(await screen.findByRole("button", { name: "Renomear Culto de domingo" }));
    await screen.findByLabelText("Nome");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument());
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("exclui o molde e recarrega a lista", async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<OrderTemplatesPanel canEdit />);

    await user.click(await screen.findByRole("button", { name: "Excluir Culto de oração" }));

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/celebrations/order-templates/t2"),
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("mostra o erro quando a exclusão falha", async () => {
    vi.mocked(api.delete).mockRejectedValue(new Error("rede"));
    const user = userEvent.setup();
    render(<OrderTemplatesPanel canEdit />);

    await user.click(await screen.findByRole("button", { name: "Excluir Culto de oração" }));

    expect(await screen.findByText("Não foi possível excluir o molde.")).toBeInTheDocument();
  });
});
