import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllergyNote } from "./AllergyNote";
import { PickupCode } from "./PickupCode";

describe("AllergyNote", () => {
  it("diz “Alergia: …” em texto, com ícone — nunca só cor", () => {
    const { container } = render(<AllergyNote allergy="amendoim" />);
    expect(screen.getByText("Alergia: amendoim")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("sem alergia informada não desenha nada", () => {
    const { container } = render(<AllergyNote allergy={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PickupCode", () => {
  it("lê os caracteres separados para o leitor de tela e desenha um por célula", () => {
    const { container } = render(<PickupCode code="A2B3" />);
    expect(screen.getByRole("img", { name: "Código de retirada: A, 2, B, 3" })).toBeInTheDocument();
    expect(container.querySelectorAll("span[aria-hidden='true']")).toHaveLength(4);
    expect(container.textContent).toBe("A2B3");
  });

  it("tem tamanho extra para a confirmação do check-in", () => {
    render(<PickupCode code="K9ZX" size="xl" />);
    expect(screen.getByRole("img").className).toContain("clamp");
  });
});
