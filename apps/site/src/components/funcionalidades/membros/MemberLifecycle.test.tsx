import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberLifecycle } from "@/components/funcionalidades/membros/MemberLifecycle";

describe("MemberLifecycle", () => {
  it("anuncia a seção pelo título", () => {
    render(<MemberLifecycle />);
    expect(screen.getByRole("heading", { name: /Três estágios\. Um fluxo automático\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<MemberLifecycle />);
    for (const texto of [
      "Primeiro contato",
      "Engajamento crescente",
      "Filiação confirmada",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
