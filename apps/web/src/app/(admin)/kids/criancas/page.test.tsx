import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import KidsCriancasPage from "./page";

vi.mock("@/components/kids/KidsPage", () => ({
  KidsPage: ({ title, children }: { title: string; children: (c: { canManage: boolean }) => React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children({ canManage: false })}
    </div>
  ),
}));
vi.mock("@/components/kids/ChildrenPanel", () => ({
  ChildrenPanel: ({ canManage }: { canManage: boolean }) => <p>criancas:{String(canManage)}</p>,
}));

describe("/kids/criancas", () => {
  it("monta o painel de crianças dentro da moldura do Kids", () => {
    render(<KidsCriancasPage />);
    expect(screen.getByRole("heading", { name: "Kids" })).toBeInTheDocument();
    expect(screen.getByText("criancas:false")).toBeInTheDocument();
  });
});
