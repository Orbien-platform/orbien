import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateVisitorModal } from "./CreateVisitorModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

describe("CreateVisitorModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render form fields when closed", () => {
    render(
      <CreateVisitorModal open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );
    expect(screen.queryByText("Cadastrar visitante")).not.toBeInTheDocument();
  });

  it("validates required name and phone before submit", async () => {
    const user = userEvent.setup();
    render(
      <CreateVisitorModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Cadastrar" }));
    expect(await screen.findByText("Nome é obrigatório.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Nome completo/), "Maria Silva");
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));
    expect(await screen.findByText("Informe um telefone válido.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("submits the visitor and shows success, then calls onCreated/onOpenChange", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CreateVisitorModal open={true} onOpenChange={onOpenChange} onCreated={onCreated} />
    );

    await user.type(screen.getByLabelText(/Nome completo/), "Maria Silva");
    await user.type(screen.getByLabelText(/Telefone/), "11999999999");
    await user.type(screen.getByLabelText(/E-mail/), "maria@email.com");

    await user.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/persons", {
        full_name: "Maria Silva",
        phone: "11999999999",
        email: "maria@email.com",
        classification: "visitor",
      })
    );

    expect(await screen.findByText("Visitante cadastrado!")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1200);

    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it("shows an error message when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));

    render(
      <CreateVisitorModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome completo/), "Maria Silva");
    await user.type(screen.getByLabelText(/Telefone/), "11999999999");
    await user.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(await screen.findByText("Erro ao cadastrar. Tente novamente.")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when the Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CreateVisitorModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("resets the form and notifies parent when closed via the modal's close control", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CreateVisitorModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/Nome completo/), "Maria Silva");
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
