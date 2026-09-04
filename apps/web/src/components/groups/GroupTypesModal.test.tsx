import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GroupTypesModal } from "./GroupTypesModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const types = [
  { id: "gt1", name: "Célula", color: "#111111", is_active: true },
  { id: "gt2", name: "Antigo", color: "#222222", is_active: false },
];

describe("GroupTypesModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { roles: ["tenant_admin"] } });
    vi.mocked(api.get).mockResolvedValue({ data: types });
  });

  it("does not render content when closed", () => {
    render(<GroupTypesModal open={false} onOpenChange={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByText("Tipos de grupo")).not.toBeInTheDocument();
  });

  it("loads and displays group types when opened", async () => {
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/groups/types", { params: { include_inactive: true } })
    );
    expect(await screen.findByText("Célula")).toBeInTheDocument();
    expect(screen.getByText("Antigo")).toBeInTheDocument();
    expect(screen.getByText("Inativo")).toBeInTheDocument();
  });

  it("shows an empty state when there are no types", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText("Nenhum tipo cadastrado.")).toBeInTheDocument();
  });

  it("validates the required name field when creating a type", async () => {
    const user = userEvent.setup();
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Novo tipo/ }));

    expect(await screen.findByRole("heading", { name: "Novo tipo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Nome é obrigatório.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("validates the color format", async () => {
    const user = userEvent.setup();
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Novo tipo/ }));
    expect(await screen.findByRole("heading", { name: "Novo tipo" })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Nome/), "Núcleo");
    await user.type(screen.getByPlaceholderText("#1C3D5A"), "not-a-color");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("Cor inválida. Use um hexadecimal, ex: #1C3D5A.")
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates a new group type and shows a toast", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={onChanged} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Novo tipo/ }));
    expect(await screen.findByRole("heading", { name: "Novo tipo" })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Nome/), "Núcleo");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/groups/types", { name: "Núcleo", color: undefined })
    );
    expect(await screen.findByText("Tipo criado")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("opens the edit form pre-filled and updates an existing type", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar tipo" }));

    expect(await screen.findByText("Editar tipo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Célula")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/groups/types/gt1", { name: "Célula", color: "#111111" })
    );
    expect(await screen.findByText("Tipo atualizado")).toBeInTheDocument();
  });

  it("shows an error message when creating a type fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Novo tipo/ }));
    await user.type(screen.getByLabelText(/Nome/), "Núcleo");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao criar tipo.")).toBeInTheDocument();
  });

  it("deactivates a type after confirmation, when the user can deactivate", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desativar" }));

    const confirmDialog = await screen.findByRole("dialog", { name: "Desativar tipo?" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Desativar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/groups/types/gt1/deactivate")
    );
    expect(await screen.findByText("Tipo desativado")).toBeInTheDocument();
  });

  it("does not show the deactivate action when the user lacks permission", async () => {
    mockUseAuth.mockReturnValue({ user: { roles: ["volunteer"] } });
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desativar" })).not.toBeInTheDocument();
  });

  it("shows a conflict message from the API when deactivation fails with 409", async () => {
    const user = userEvent.setup();
    const err = Object.assign(new Error("conflict"), {
      isAxiosError: true,
      response: { status: 409, data: { message: "Tipo em uso." } },
    });
    vi.mocked(api.patch).mockRejectedValue(err);

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desativar" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Desativar tipo?" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Desativar" }));

    expect(await screen.findByText("Tipo em uso.")).toBeInTheDocument();
  });

  it("hides the toast automatically after the timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Novo tipo/ }));
    await user.type(screen.getByLabelText(/Nome/), "Núcleo");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Tipo criado")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(4100);
    await waitFor(() =>
      expect(screen.queryByText("Tipo criado")).not.toBeInTheDocument()
    );

    vi.useRealTimers();
  });

  it("falls back to an empty list when loading group types fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Nenhum tipo cadastrado.")).toBeInTheDocument();
  });

  it("shows a generic error message when deactivation fails without an axios response", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockRejectedValue(new Error("network down"));

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desativar" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Desativar tipo?" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Desativar" }));

    expect(await screen.findByText("Erro ao desativar tipo.")).toBeInTheDocument();
  });

  it("updates the color via the native color input", async () => {
    const user = userEvent.setup();
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Novo tipo/ }));
    expect(await screen.findByRole("heading", { name: "Novo tipo" })).toBeInTheDocument();

    const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorInput).toBeTruthy();
    expect(colorInput.value.toLowerCase()).toBe("#94a3b8");

    await user.type(screen.getByLabelText(/Nome/), "Núcleo");
    fireEvent.input(colorInput, { target: { value: "#abcdef" } });

    expect(screen.getByPlaceholderText("#1C3D5A")).toHaveValue("#abcdef");
  });

  it("closes the create/edit form via the Cancelar button", async () => {
    const user = userEvent.setup();
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Novo tipo/ }));
    expect(await screen.findByRole("heading", { name: "Novo tipo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Novo tipo" })).not.toBeInTheDocument()
    );
  });

  it("closes the deactivate confirmation via its own Cancelar button", async () => {
    const user = userEvent.setup();
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desativar" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Desativar tipo?" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Desativar tipo?" })).not.toBeInTheDocument()
    );
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("allows deactivation for admin_congregation role too", async () => {
    mockUseAuth.mockReturnValue({ user: { roles: ["admin_congregation"] } });
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desativar" })).toBeInTheDocument();
  });

  it("opens the edit form for a type without a color and falls back to the default dot color", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      data: [{ id: "gt3", name: "Sem cor", color: null, is_active: true }],
    });

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Sem cor")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar tipo" }));

    expect(await screen.findByText("Editar tipo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("#1C3D5A")).toHaveValue("");
  });

  it("shows an update-specific error message when editing an existing type fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar tipo" }));
    expect(await screen.findByText("Editar tipo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Erro ao atualizar tipo.")).toBeInTheDocument();
  });

  it("falls back to a default message when a 409 deactivation error carries no message", async () => {
    const user = userEvent.setup();
    const err = Object.assign(new Error("conflict"), {
      isAxiosError: true,
      response: { status: 409, data: {} },
    });
    vi.mocked(api.patch).mockRejectedValue(err);

    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desativar" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Desativar tipo?" });
    await user.click(within(confirmDialog).getByRole("button", { name: "Desativar" }));

    expect(
      await screen.findByText("Não é possível desativar este tipo.")
    ).toBeInTheDocument();
  });

  it("closes the deactivate confirmation via backdrop click (onOpenChange)", async () => {
    const user = userEvent.setup();
    render(<GroupTypesModal open={true} onOpenChange={vi.fn()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Célula")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desativar" }));
    await screen.findByRole("dialog", { name: "Desativar tipo?" });

    const backdrop = document.querySelector(".bg-black\\/40") as HTMLElement;
    expect(backdrop).toBeTruthy();
    await user.click(backdrop);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Desativar tipo?" })).not.toBeInTheDocument()
    );
  });
});
