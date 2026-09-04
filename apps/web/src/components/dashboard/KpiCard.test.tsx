import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./KpiCard";

describe("KpiCard", () => {
  it("renderiza título, valor e ícone", () => {
    const { container } = render(<KpiCard title="Pessoas" value="128" icon={Users} />);
    expect(screen.getByText("Pessoas")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("mostra skeletons quando isLoading, ocultando o valor", () => {
    const { container } = render(
      <KpiCard title="Pessoas" value="128" icon={Users} isLoading />
    );
    expect(screen.queryByText("128")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
  });

  it("renderiza o suffix antes do valor", () => {
    render(<KpiCard title="Receita" value="12.345,00" suffix="R$" icon={Users} />);
    expect(screen.getByText("R$")).toBeInTheDocument();
    expect(screen.getByText("12.345,00")).toBeInTheDocument();
  });

  it("aplica font-mono quando mono é true", () => {
    render(<KpiCard title="Código" value="AB12" icon={Users} mono />);
    expect(screen.getByText("AB12")).toHaveClass("font-mono");
  });

  it("mostra delta com estilo 'up' e ícone de tendência de alta", () => {
    const { container } = render(
      <KpiCard title="Pessoas" value="128" delta="+12%" deltaType="up" icon={Users} />
    );
    const delta = screen.getByText("+12%").closest("div");
    expect(delta?.className).toContain("text-teal");
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("mostra delta com estilo 'down'", () => {
    render(<KpiCard title="Pessoas" value="128" delta="-5%" deltaType="down" icon={Users} />);
    const delta = screen.getByText("-5%").closest("div");
    expect(delta?.className).toContain("text-crimson");
  });

  it("mostra delta com estilo 'neutral' por padrão", () => {
    render(<KpiCard title="Pessoas" value="128" delta="0%" icon={Users} />);
    const delta = screen.getByText("0%").closest("div");
    expect(delta?.className).toContain("text-stone");
  });

  it("não renderiza bloco de delta quando delta não é passado", () => {
    render(<KpiCard title="Pessoas" value="128" icon={Users} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("renderiza children abaixo do valor", () => {
    render(
      <KpiCard title="Pessoas" value="128" icon={Users}>
        <span>gráfico extra</span>
      </KpiCard>
    );
    expect(screen.getByText("gráfico extra")).toBeInTheDocument();
  });
});
