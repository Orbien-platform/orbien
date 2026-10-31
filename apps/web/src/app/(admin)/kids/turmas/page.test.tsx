import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import KidsTurmasPage from "./page";

vi.mock("@/components/kids/KidsPage", () => ({
  KidsPage: ({ title, children }: { title: string; children: (c: { canManage: boolean }) => React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children({ canManage: true })}
    </div>
  ),
}));
vi.mock("@/components/kids/RoomsPanel", () => ({
  RoomsPanel: ({ canManage }: { canManage: boolean }) => <p>turmas:{String(canManage)}</p>,
}));

describe("/kids/turmas", () => {
  it("monta o painel de turmas dentro da moldura do Kids", () => {
    render(<KidsTurmasPage />);
    expect(screen.getByRole("heading", { name: "Kids" })).toBeInTheDocument();
    expect(screen.getByText("turmas:true")).toBeInTheDocument();
  });
});
