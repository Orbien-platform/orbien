import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("não renderiza conteúdo quando open é false", () => {
    render(
      <Modal open={false} onOpenChange={vi.fn()} title="Título">
        <p>Conteúdo</p>
      </Modal>
    );
    expect(screen.queryByText("Conteúdo")).not.toBeInTheDocument();
  });

  it("renderiza título, descrição e children quando aberto", () => {
    render(
      <Modal open onOpenChange={vi.fn()} title="Editar pessoa" description="Ajuste os dados">
        <p>Conteúdo do formulário</p>
      </Modal>
    );
    expect(screen.getByText("Editar pessoa")).toBeInTheDocument();
    expect(screen.getByText("Ajuste os dados")).toBeInTheDocument();
    expect(screen.getByText("Conteúdo do formulário")).toBeInTheDocument();
  });

  it("chama onOpenChange(false) ao clicar em fechar", async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="Título">
        <p>Conteúdo</p>
      </Modal>
    );
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });
});
