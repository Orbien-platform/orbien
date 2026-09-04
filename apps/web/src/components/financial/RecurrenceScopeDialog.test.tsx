import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { RecurrenceScopeDialog } from "./RecurrenceScopeDialog";

describe("RecurrenceScopeDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <RecurrenceScopeDialog open={false} mode="edit" onCancel={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(screen.queryByText("Alterar lançamento recorrente")).not.toBeInTheDocument();
  });

  it("shows the edit title and confirms with the default scope", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <RecurrenceScopeDialog open={true} mode="edit" onCancel={vi.fn()} onConfirm={onConfirm} />
    );

    expect(screen.getByText("Alterar lançamento recorrente")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledWith("this");
  });

  it("shows the delete title and confirms with 'this_and_future' when selected", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <RecurrenceScopeDialog open={true} mode="delete" onCancel={vi.fn()} onConfirm={onConfirm} />
    );

    expect(screen.getByText("Excluir lançamento recorrente")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Este e os próximos"));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledWith("this_and_future");
  });

  it("switches back to 'this' scope after selecting the other option", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <RecurrenceScopeDialog open={true} mode="edit" onCancel={vi.fn()} onConfirm={onConfirm} />
    );

    await user.click(screen.getByLabelText("Este e os próximos"));
    await user.click(screen.getByLabelText("Somente este lançamento"));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledWith("this");
  });

  it("calls onCancel when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <RecurrenceScopeDialog open={true} mode="edit" onCancel={onCancel} onConfirm={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables inputs and buttons while submitting", () => {
    render(
      <RecurrenceScopeDialog
        open={true}
        mode="edit"
        isSubmitting={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByLabelText("Somente este lançamento")).toBeDisabled();
  });
});
