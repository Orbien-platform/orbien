import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CategoriesModal } from "./CategoriesModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const categories = [
  {
    id: "c1",
    name: "Dízimos",
    type: "income" as const,
    parent_id: null,
    description: null,
    is_system: false,
    children: [],
  },
  {
    id: "c4",
    name: "Categoria do sistema",
    type: "income" as const,
    parent_id: null,
    description: null,
    is_system: true,
    children: [],
  },
  {
    id: "c2",
    name: "Despesas Gerais",
    type: "expense" as const,
    parent_id: null,
    description: null,
    is_system: false,
    children: [
      {
        id: "c3",
        name: "Aluguel",
        type: "expense" as const,
        parent_id: "c2",
        description: null,
        is_system: false,
        children: [],
      },
    ],
  },
];

describe("CategoriesModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: categories });
  });

  it("does not render content when closed", () => {
    render(<CategoriesModal open={false} onOpenChange={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByText("Categorias financeiras")).not.toBeInTheDocument();
  });

  it("loads categories on open and lists them per tab", async () => {
    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));

    expect(await screen.findByText("Dízimos")).toBeInTheDocument();
    expect(screen.queryByText("Despesas Gerais")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Despesas" }));

    expect(await screen.findByText("Despesas Gerais")).toBeInTheDocument();
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
  });

  it("requires a name before creating a category", async () => {
    const user = userEvent.setup();
    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));

    await user.click(screen.getByRole("button", { name: "Nova categoria" }));
    expect(await screen.findByRole("heading", { name: "Nova categoria" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Nome é obrigatório.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates a category and shows a success toast, then refreshes", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onChanged = vi.fn();

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={onChanged} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));

    await user.click(screen.getByRole("button", { name: "Nova categoria" }));
    await user.type(screen.getByLabelText(/Nome/), "Ofertas");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/financial/categories", {
        name: "Ofertas",
        type: "income",
        parent_id: null,
        description: null,
      })
    );

    expect(await screen.findByText("Categoria criada")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nova categoria" })).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("shows an error when creating a category fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));

    await user.click(screen.getByRole("button", { name: "Nova categoria" }));
    await user.type(screen.getByLabelText(/Nome/), "Ofertas");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao criar categoria.")).toBeInTheDocument();
  });

  it("edits an existing category", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    await screen.findByText("Dízimos");

    await user.click(screen.getByRole("button", { name: "Editar categoria" }));
    expect(await screen.findByText("Editar categoria")).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Nome/) as HTMLInputElement;
    expect(nameInput.value).toBe("Dízimos");

    await user.clear(nameInput);
    await user.type(nameInput, "Dízimos e Ofertas");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/financial/categories/c1", {
        name: "Dízimos e Ofertas",
        type: "income",
        parent_id: null,
        description: null,
      })
    );
    expect(await screen.findByText("Categoria atualizada")).toBeInTheDocument();
  });

  it("deletes a category after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
    const onChanged = vi.fn();

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={onChanged} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    await screen.findByText("Dízimos");

    await user.click(screen.getByRole("button", { name: "Excluir categoria" }));
    expect(await screen.findByText("Excluir categoria?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/financial/categories/c1"));
    expect(await screen.findByText("Categoria excluída")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows an error toast when deleting a category fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.delete).mockRejectedValue(new Error("fail"));

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    await screen.findByText("Dízimos");

    await user.click(screen.getByRole("button", { name: "Excluir categoria" }));
    expect(await screen.findByText("Excluir categoria?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/financial/categories/c1"));
    expect(await screen.findByText("Erro ao excluir categoria.")).toBeInTheDocument();
  });

  it("cancels the delete confirmation without calling the API", async () => {
    const user = userEvent.setup();

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    await screen.findByText("Dízimos");

    await user.click(screen.getByRole("button", { name: "Excluir categoria" }));
    expect(await screen.findByText("Excluir categoria?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByText("Excluir categoria?")).not.toBeInTheDocument()
    );
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("dismisses the delete confirmation on escape", async () => {
    const user = userEvent.setup();

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    await screen.findByText("Dízimos");

    await user.click(screen.getByRole("button", { name: "Excluir categoria" }));
    expect(await screen.findByText("Excluir categoria?")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByText("Excluir categoria?")).not.toBeInTheDocument()
    );
  });

  it("hides the success toast automatically after a few seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));

    await user.click(screen.getByRole("button", { name: "Nova categoria" }));
    await user.type(screen.getByLabelText(/Nome/), "Ofertas");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Categoria criada")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.queryByText("Categoria criada")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("cancels the create/edit form without submitting", async () => {
    const user = userEvent.setup();

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));

    await user.click(screen.getByRole("button", { name: "Nova categoria" }));
    expect(await screen.findByRole("heading", { name: "Nova categoria" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Nova categoria" })).not.toBeInTheDocument()
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("changes the type and parent category and types a description in the form", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));

    await user.click(screen.getByRole("button", { name: "Nova categoria" }));
    await user.type(screen.getByLabelText(/Nome/), "Subcategoria");

    const [typeSelect, parentSelect] = screen.getAllByRole("combobox");
    expect((typeSelect as HTMLSelectElement).value).toBe("income");

    await user.selectOptions(typeSelect, "expense");
    expect((typeSelect as HTMLSelectElement).value).toBe("expense");

    await user.selectOptions(parentSelect, "c2");
    expect((parentSelect as HTMLSelectElement).value).toBe("c2");

    await user.type(screen.getByLabelText(/Descrição/), "Uma descrição");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/financial/categories", {
        name: "Subcategoria",
        type: "expense",
        parent_id: "c2",
        description: "Uma descrição",
      })
    );
  });

  it("shows a system badge for system categories and no actions to edit/delete them", async () => {
    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    expect(await screen.findByText("Categoria do sistema")).toBeInTheDocument();
    expect(screen.getByText("Sistema")).toBeInTheDocument();
  });

  it("keeps the categories list empty when the request fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network"));

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    expect(
      await screen.findByText("Nenhuma categoria cadastrada.")
    ).toBeInTheDocument();
  });

  it("falls back to an empty list when the response has no data", async () => {
    vi.mocked(api.get).mockResolvedValue({});

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    expect(
      await screen.findByText("Nenhuma categoria cadastrada.")
    ).toBeInTheDocument();
  });

  it("shows an error when editing a category fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    await screen.findByText("Dízimos");

    await user.click(screen.getAllByRole("button", { name: "Editar categoria" })[0]);
    expect(await screen.findByText("Editar categoria")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao atualizar categoria.")).toBeInTheDocument();
  });

  it("warns that subcategories will be affected when deleting a category with children", async () => {
    const user = userEvent.setup();

    render(<CategoriesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));

    await user.click(screen.getByRole("tab", { name: "Despesas" }));
    await screen.findByText("Despesas Gerais");

    await user.click(screen.getAllByRole("button", { name: "Excluir categoria" })[0]);

    expect(
      await screen.findByText("Esta categoria possui subcategorias que também serão afetadas.")
    ).toBeInTheDocument();
  });
});
