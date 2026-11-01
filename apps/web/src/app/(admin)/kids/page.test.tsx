import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import KidsBalcaoPage from "./page";

vi.mock("@/components/kids/KidsPage", () => ({
  KidsPage: ({ title, children }: { title: string; children: (c: { canManage: boolean }) => React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children({ canManage: true })}
    </div>
  ),
}));
vi.mock("@/components/kids/Counter", () => ({
  Counter: ({ canManage }: { canManage: boolean }) => <p>balcao:{String(canManage)}</p>,
}));

describe("/kids", () => {
  it("monta o balcão dentro da moldura do Kids", () => {
    render(<KidsBalcaoPage />);
    expect(screen.getByRole("heading", { name: "Kids" })).toBeInTheDocument();
    expect(screen.getByText("balcao:true")).toBeInTheDocument();
  });
});
