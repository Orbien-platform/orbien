import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateMinistryModal } from "./CreateMinistryModal";
import api from "@/lib/api";
import type { MinistryTreeNode } from "@/lib/ministryTree";

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

const emptyTree: MinistryTreeNode[] = [];
const existingTree: MinistryTreeNode[] = [
  {
    id: "m1",
    name: "Louvor",
    children: [{ id: "m2", name: "Vocal", children: [] }],
  },
];

describe("CreateMinistryModal", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it("does not render form fields when closed", () => {
    render(
      <CreateMinistryModal open={false} onOpenChange={vi.fn()} tree={emptyTree} onCreated={vi.fn()} />
    );
    expect(screen.queryByText("Novo ministério")).not.toBeInTheDocument();
  });

  it("requires a name before submitting", async () => {
    const user = userEvent.setup();
    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={emptyTree} onCreated={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Criar ministério" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nome é obrigatório.");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("requires a parent ministry when a root ministry already exists", async () => {
    const user = userEvent.setup();
    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={existingTree} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Instrumental");
    await user.click(screen.getByRole("button", { name: "Criar ministério" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Já existe um ministério principal. Selecione um ministério pai."
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("lists flattened parent options reflecting the tree hierarchy", () => {
    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={existingTree} onCreated={vi.fn()} />
    );

    const select = screen.getByLabelText(/Ministério pai/) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(optionLabels).toEqual(
      expect.arrayContaining(["Nenhum (ministério raiz)", "Louvor", expect.stringContaining("Vocal")])
    );
  });

  it("submits the ministry and shows success, then calls onCreated/onOpenChange", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CreateMinistryModal open={true} onOpenChange={onOpenChange} tree={emptyTree} onCreated={onCreated} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Louvor e Adoração");
    await user.click(screen.getByRole("button", { name: "Criar ministério" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/volunteers/ministries",
        expect.objectContaining({
          name: "Louvor e Adoração",
          description: undefined,
          color: "#1E3A5F",
          parent_ministry_id: undefined,
        })
      )
    );

    expect(await screen.findByText("Ministério criado com sucesso!")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1200);

    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it("shows a toast with a generic error message when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("network fail"));

    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={emptyTree} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Louvor");
    await user.click(screen.getByRole("button", { name: "Criar ministério" }));

    expect(
      await screen.findByText("Erro ao criar ministério. Tente novamente.")
    ).toBeInTheDocument();
  });

  it("shows the API message in the toast on a 409 conflict, and auto-dismisses it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "Já existe um ministério raiz." } },
    });

    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={emptyTree} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Louvor");
    await user.click(screen.getByRole("button", { name: "Criar ministério" }));

    expect(await screen.findByText("Já existe um ministério raiz.")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.queryByText("Já existe um ministério raiz.")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("falls back to a default message when the 409 response has no message", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: {} },
    });

    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={emptyTree} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Louvor");
    await user.click(screen.getByRole("button", { name: "Criar ministério" }));

    expect(await screen.findByText("Já existe um ministério raiz.")).toBeInTheDocument();
  });

  it("falls back to a default message when the 400 response has no message", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: {} },
    });

    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={emptyTree} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Louvor");
    await user.click(screen.getByRole("button", { name: "Criar ministério" }));

    expect(await screen.findByText("Dados inválidos.")).toBeInTheDocument();
  });

  it("shows the API message in the toast on a 400 validation error", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "Dados inválidos." } },
    });

    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={emptyTree} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Louvor");
    await user.click(screen.getByRole("button", { name: "Criar ministério" }));

    expect(await screen.findByText("Dados inválidos.")).toBeInTheDocument();
  });

  it("resets the form when closed via the modal's close button", async () => {
    const user = userEvent.setup();

    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={emptyTree} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Louvor");
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect((screen.getByLabelText(/Nome/) as HTMLInputElement).value).toBe("");
  });

  it("calls onOpenChange when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CreateMinistryModal open={true} onOpenChange={onOpenChange} tree={emptyTree} onCreated={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("fills description, parent ministry and color, submitting them all", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(
      <CreateMinistryModal open={true} onOpenChange={vi.fn()} tree={existingTree} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome/), "Instrumental");
    await user.type(screen.getByLabelText(/Descrição/), "Banda instrumental");
    await user.selectOptions(screen.getByLabelText(/Ministério pai/), "m2");
    await user.click(screen.getByRole("button", { name: "Teal" }));
    await user.click(screen.getByRole("button", { name: "Criar ministério" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/volunteers/ministries",
        expect.objectContaining({
          name: "Instrumental",
          description: "Banda instrumental",
          color: "#0D9488",
          parent_ministry_id: "m2",
        })
      )
    );
  });
});
