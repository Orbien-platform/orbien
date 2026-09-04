import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("mostra o rótulo em português para visitor", () => {
    render(<StatusBadge classification="visitor" />);
    expect(screen.getByText("Visitante")).toBeInTheDocument();
  });

  it("mostra o rótulo em português para attendee", () => {
    render(<StatusBadge classification="attendee" />);
    const el = screen.getByText("Frequentador");
    expect(el.className).toContain("text-navy");
  });

  it("mostra o rótulo em português para member", () => {
    render(<StatusBadge classification="member" />);
    const el = screen.getByText("Membro");
    expect(el.className).toContain("text-teal");
  });

  it("cai para o rótulo e estilo de visitor quando a classificação é desconhecida", () => {
    render(<StatusBadge classification="unknown-status" />);
    const el = screen.getByText("Visitante");
    expect(el.className).toContain("text-stone");
  });

  it("mescla className customizada", () => {
    render(<StatusBadge classification="member" className="ml-1" />);
    expect(screen.getByText("Membro").className).toContain("ml-1");
  });
});
