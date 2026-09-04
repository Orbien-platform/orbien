import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

function ControlledSheet({ side }: { side?: "top" | "right" | "bottom" | "left" }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>Abrir</SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Editar item</SheetTitle>
          <SheetDescription>Preencha os campos</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose>Cancelar</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("abre ao clicar no trigger e mostra título/descrição", async () => {
    render(<ControlledSheet />);
    expect(screen.queryByText("Editar item")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Abrir"));
    expect(screen.getByText("Editar item")).toBeInTheDocument();
    expect(screen.getByText("Preencha os campos")).toBeInTheDocument();
  });

  it("fecha ao clicar em SheetClose", async () => {
    render(<ControlledSheet />);
    await userEvent.click(screen.getByText("Abrir"));
    expect(screen.getByText("Editar item")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Cancelar"));
    expect(screen.queryByText("Editar item")).not.toBeInTheDocument();
  });

  it("aplica data-side conforme a prop side", async () => {
    render(<ControlledSheet side="left" />);
    await userEvent.click(screen.getByText("Abrir"));
    const content = screen.getByText("Editar item").closest('[data-slot="sheet-content"]');
    expect(content).toHaveAttribute("data-side", "left");
  });

  it("oculta o botão de fechar padrão quando showCloseButton é false", async () => {
    function NoCloseButton() {
      const [open, setOpen] = useState(true);
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent showCloseButton={false}>
            <SheetTitle>Sem botão</SheetTitle>
          </SheetContent>
        </Sheet>
      );
    }
    render(<NoCloseButton />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("SheetTrigger repassa onClick customizado além de abrir", async () => {
    const onClick = vi.fn();
    function WithClick() {
      const [open, setOpen] = useState(false);
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger onClick={onClick}>Abrir</SheetTrigger>
          <SheetContent>
            <SheetTitle>Título</SheetTitle>
          </SheetContent>
        </Sheet>
      );
    }
    render(<WithClick />);
    await userEvent.click(screen.getByText("Abrir"));
    expect(onClick).toHaveBeenCalled();
  });
});
