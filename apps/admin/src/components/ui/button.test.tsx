// Espelho da spec de mesmo nome no `apps/web`: o componente é byte a byte
// idêntico nos dois apps (copiado de lá quando o console nasceu). Enquanto
// forem duplicatas, as specs também são — se um dia virarem um pacote
// compartilhado, esta some junto.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("renderiza o children e responde a clique", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    const btn = screen.getByRole("button", { name: "Salvar" });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("aplica variant e size às classes", () => {
    render(<Button variant="destructive" size="lg">Excluir</Button>);
    const btn = screen.getByRole("button", { name: "Excluir" });
    expect(btn.className).toContain("bg-destructive/10");
    expect(btn.className).toContain("h-9");
  });

  it("fica desabilitado e não dispara onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Indisponível
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Indisponível" });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("buttonVariants gera classes para variant/size default", () => {
    const classes = buttonVariants({});
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("h-8");
  });
});
