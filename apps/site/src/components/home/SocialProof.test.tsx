import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SocialProof } from "@/components/home/SocialProof";

describe("SocialProof", () => {
  it("traz o rótulo da seção", () => {
    render(<SocialProof />);
    expect(screen.getByText("Igrejas-piloto")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<SocialProof />);
    for (const texto of [
      "Doca Church",
      "Cada feature é validada com um pastor antes de ir pra produção.",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
