import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CostCentersModal } from "./CostCentersModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const costCenters = [
  { id: "cc1", name: "Missões", description: "Fundo de missões" },
  { id: "cc2", name: "Templo", description: null },
];

describe("CostCentersModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: costCenters });
  });

  it("does not render content when closed", () => {
    render(<CostCentersModal open={false} onOpenChange={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByText("Centros de custo")).not.toBeInTheDocument();
  });

  it("loads cost centers on open and lists them", async () => {
    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));

    expect(await screen.findByText("Missões")).toBeInTheDocument();
    expect(screen.getByText("Fundo de missões")).toBeInTheDocument();
    expect(screen.getByText("Templo")).toBeInTheDocument();
  });

  it("requires a name before creating a cost center", async () => {
    const user = userEvent.setup();
    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));

    await user.click(screen.getByRole("button", { name: "Novo centro de custo" }));
    expect(await screen.findByRole("heading", { name: "Novo centro de custo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Nome é obrigatório.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates a cost center and shows a success toast, then refreshes", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onChanged = vi.fn();

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={onChanged} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));

    await user.click(screen.getByRole("button", { name: "Novo centro de custo" }));
    await user.type(screen.getByLabelText(/Nome/), "Educação");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/financial/cost-centers", {
        name: "Educação",
        description: null,
      })
    );

    expect(await screen.findByText("Centro de custo criado")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Novo centro de custo" })).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("shows an error when creating a cost center fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));

    await user.click(screen.getByRole("button", { name: "Novo centro de custo" }));
    await user.type(screen.getByLabelText(/Nome/), "Educação");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao criar centro de custo.")).toBeInTheDocument();
  });

  it("edits an existing cost center", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));
    await screen.findByText("Missões");

    await user.click(screen.getAllByRole("button", { name: "Editar centro de custo" })[0]);
    expect(await screen.findByText("Editar centro de custo")).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Nome/) as HTMLInputElement;
    expect(nameInput.value).toBe("Missões");

    await user.clear(nameInput);
    await user.type(nameInput, "Missões Transculturais");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/financial/cost-centers/cc1", {
        name: "Missões Transculturais",
        description: "Fundo de missões",
      })
    );
    expect(await screen.findByText("Centro de custo atualizado")).toBeInTheDocument();
  });

  it("shows an error when editing a cost center fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));
    await screen.findByText("Missões");

    await user.click(screen.getAllByRole("button", { name: "Editar centro de custo" })[0]);
    expect(await screen.findByText("Editar centro de custo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao atualizar centro de custo.")).toBeInTheDocument();
  });

  it("deletes a cost center after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const onChanged = vi.fn();

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={onChanged} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));
    await screen.findByText("Missões");

    await user.click(screen.getAllByRole("button", { name: "Excluir centro de custo" })[0]);
    expect(await screen.findByText("Excluir centro de custo?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/financial/cost-centers/cc1"));
    expect(await screen.findByText("Centro de custo excluído")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows an error toast when deleting a cost center fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.delete).mockRejectedValue(new Error("fail"));

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));
    await screen.findByText("Missões");

    await user.click(screen.getAllByRole("button", { name: "Excluir centro de custo" })[0]);
    expect(await screen.findByText("Excluir centro de custo?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/financial/cost-centers/cc1"));
    expect(await screen.findByText("Erro ao excluir centro de custo.")).toBeInTheDocument();
  });

  it("cancels the delete confirmation without calling the API", async () => {
    const user = userEvent.setup();

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));
    await screen.findByText("Missões");

    await user.click(screen.getAllByRole("button", { name: "Excluir centro de custo" })[0]);
    expect(await screen.findByText("Excluir centro de custo?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByText("Excluir centro de custo?")).not.toBeInTheDocument()
    );
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("cancels the create/edit form without submitting", async () => {
    const user = userEvent.setup();

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));

    await user.click(screen.getByRole("button", { name: "Novo centro de custo" }));
    expect(await screen.findByRole("heading", { name: "Novo centro de custo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Novo centro de custo" })).not.toBeInTheDocument()
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("hides the success toast automatically after a few seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));

    await user.click(screen.getByRole("button", { name: "Novo centro de custo" }));
    await user.type(screen.getByLabelText(/Nome/), "Educação");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Centro de custo criado")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.queryByText("Centro de custo criado")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("keeps the list empty when the request fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network"));

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));
    expect(
      await screen.findByText("Nenhum centro de custo cadastrado.")
    ).toBeInTheDocument();
  });

  it("falls back to an empty list when the response has no data", async () => {
    vi.mocked(api.get).mockResolvedValue({});

    render(<CostCentersModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));
    expect(
      await screen.findByText("Nenhum centro de custo cadastrado.")
    ).toBeInTheDocument();
  });
});
