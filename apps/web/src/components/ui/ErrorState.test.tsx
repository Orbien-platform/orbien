import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
  it("se anuncia como alerta e oferece tentar de novo", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar.");
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("aceita título e texto próprios e não desenha o botão sem onRetry", () => {
    render(<ErrorState title="Falha nos grupos" description="Tente mais tarde." />);
    expect(screen.getByText("Falha nos grupos")).toBeInTheDocument();
    expect(screen.getByText("Tente mais tarde.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
