import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("mostra título, texto e a ação", () => {
    render(
      <EmptyState
        icon={Users}
        title="Nenhuma pessoa ainda"
        description="Cadastre a primeira para começar."
        action={<button>Cadastrar</button>}
      />
    );
    expect(screen.getByText("Nenhuma pessoa ainda")).toBeInTheDocument();
    expect(screen.getByText("Cadastre a primeira para começar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cadastrar" })).toBeInTheDocument();
  });

  it("funciona só com ícone e título", () => {
    render(<EmptyState icon={Users} title="Vazio" />);
    expect(screen.getByRole("status")).toHaveTextContent("Vazio");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
