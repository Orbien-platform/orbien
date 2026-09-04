import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImportHelpModal } from "./ImportHelpModal";

describe("ImportHelpModal", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("does not render content when closed", () => {
    render(<ImportHelpModal open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("Importar pessoas — guia rápido")).not.toBeInTheDocument();
  });

  it("shows the column guide and accepted formats", () => {
    render(<ImportHelpModal open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Importar pessoas — guia rápido")).toBeInTheDocument();
    expect(screen.getByText("Nome")).toBeInTheDocument();
    expect(screen.getByText("Telefone")).toBeInTheDocument();
    expect(screen.getByText(/Aceitamos arquivos/)).toBeInTheDocument();
  });

  it("downloads the CSV template", async () => {
    const user = userEvent.setup();
    render(<ImportHelpModal open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Baixar modelo CSV" }));

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("calls onOpenChange(false) when Fechar is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ImportHelpModal open={true} onOpenChange={onOpenChange} />);

    const closeButtons = screen.getAllByRole("button", { name: "Fechar" });
    await user.click(closeButtons[closeButtons.length - 1]);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
