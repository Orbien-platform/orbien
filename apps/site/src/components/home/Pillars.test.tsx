import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pillars } from "@/components/home/Pillars";

describe("Pillars", () => {
  it("anuncia a seção pelo título", () => {
    render(<Pillars />);
    expect(screen.getByRole("heading", { name: /Três motivos para a sua igreja começar hoje\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<Pillars />);
    for (const texto of [
      "Sua igreja entra hoje.",
      "O app é seu, não nosso.",
      "Você vê o que está acontecendo.",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
