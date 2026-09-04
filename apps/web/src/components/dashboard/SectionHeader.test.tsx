import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("renderiza apenas o título quando não há action", () => {
    render(<SectionHeader title="Últimos cadastros" />);
    expect(screen.getByText("Últimos cadastros")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renderiza o link de ação com href e rótulo corretos", () => {
    render(
      <SectionHeader
        title="Últimos cadastros"
        action={{ href: "/pessoas", label: "Ver todos" }}
      />
    );
    const link = screen.getByRole("link", { name: /Ver todos/ });
    expect(link).toHaveAttribute("href", "/pessoas");
  });
});
