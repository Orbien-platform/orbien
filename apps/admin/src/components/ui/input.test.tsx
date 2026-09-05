// Espelho da spec de mesmo nome no `apps/web`: o componente é byte a byte
// idêntico nos dois apps (copiado de lá quando o console nasceu). Enquanto
// forem duplicatas, as specs também são — se um dia virarem um pacote
// compartilhado, esta some junto.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("aceita digitação e propaga type", async () => {
    render(<Input type="email" placeholder="voce@exemplo.com" />);
    const input = screen.getByPlaceholderText("voce@exemplo.com");
    expect(input).toHaveAttribute("type", "email");
    await userEvent.type(input, "a@b.com");
    expect(input).toHaveValue("a@b.com");
  });

  it("fica desabilitado quando disabled", () => {
    render(<Input disabled placeholder="desativado" />);
    expect(screen.getByPlaceholderText("desativado")).toBeDisabled();
  });

  it("mescla className customizada", () => {
    render(<Input className="w-40" placeholder="x" />);
    expect(screen.getByPlaceholderText("x").className).toContain("w-40");
  });
});
