import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PeriodNavigator } from "./PeriodNavigator";
import type { Period } from "@/lib/period";

const month: Period = { mode: "month", start: "2026-10-01", end: "2026-10-31" };

describe("PeriodNavigator", () => {
  it("mostra o período em texto e marca o modo ativo", () => {
    render(<PeriodNavigator period={month} onChange={() => {}} />);
    expect(screen.getByText("outubro de 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mês" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Ano" })).toHaveAttribute("aria-pressed", "false");
  });

  it("anda para o mês anterior e para o seguinte", () => {
    const onChange = vi.fn();
    render(<PeriodNavigator period={month} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Período anterior" }));
    expect(onChange).toHaveBeenLastCalledWith({ mode: "month", start: "2026-09-01", end: "2026-09-30" });

    fireEvent.click(screen.getByRole("button", { name: "Próximo período" }));
    expect(onChange).toHaveBeenLastCalledWith({ mode: "month", start: "2026-11-01", end: "2026-11-30" });
  });

  it("troca para trimestre e ano mantendo o mês", () => {
    const onChange = vi.fn();
    render(<PeriodNavigator period={month} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Trimestre" }));
    expect(onChange).toHaveBeenLastCalledWith({ mode: "quarter", start: "2026-10-01", end: "2026-12-31" });

    fireEvent.click(screen.getByRole("button", { name: "Ano" }));
    expect(onChange).toHaveBeenLastCalledWith({ mode: "year", start: "2026-01-01", end: "2026-12-31" });
  });

  it("personalizado mostra as duas datas e some com as setas", () => {
    const onChange = vi.fn();
    render(<PeriodNavigator period={month} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    expect(onChange).toHaveBeenLastCalledWith({ mode: "custom", start: "2026-10-01", end: "2026-10-31" });
  });

  it("no modo personalizado edita início e fim", () => {
    const onChange = vi.fn();
    const custom: Period = { mode: "custom", start: "2026-10-10", end: "2026-10-19" };
    render(<PeriodNavigator period={custom} onChange={onChange} />);

    expect(screen.queryByRole("button", { name: "Período anterior" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-10-05" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: "custom", start: "2026-10-05", end: "2026-10-19" });
    fireEvent.change(screen.getByLabelText("até"), { target: { value: "2026-10-25" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: "custom", start: "2026-10-10", end: "2026-10-25" });
  });

  it("avisa quando o intervalo está incompleto ou invertido", () => {
    render(
      <PeriodNavigator
        period={{ mode: "custom", start: "2026-10-20", end: "2026-10-10" }}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("final igual ou posterior");
  });
});
