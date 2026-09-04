import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CurrencyInput } from "./CurrencyInput";

function ControlledCurrencyInput({
  initial = 0,
  onValueChange,
}: {
  initial?: number;
  onValueChange?: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CurrencyInput
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onValueChange?.(v);
      }}
    />
  );
}

describe("CurrencyInput", () => {
  it("mostra vazio quando o valor é zero", () => {
    render(<CurrencyInput value={0} onValueChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("0,00")).toHaveValue("");
  });

  it("formata o valor em reais com separador de milhar", () => {
    render(<CurrencyInput value={1234.5} onValueChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("0,00")).toHaveValue("1.234,50");
  });

  it("acumula dígitos digitados como centavos, controlado pelo pai", async () => {
    const onValueChange = vi.fn();
    render(<ControlledCurrencyInput onValueChange={onValueChange} />);
    const input = screen.getByPlaceholderText("0,00");
    await userEvent.type(input, "1050");
    // "1" -> 0.01, "10" -> 0.10, "105" -> 1.05, "1050" -> 10.50
    expect(onValueChange).toHaveBeenLastCalledWith(10.5);
    expect(input).toHaveValue("10,50");
  });

  it("ignora caracteres não numéricos", async () => {
    const onValueChange = vi.fn();
    render(<ControlledCurrencyInput onValueChange={onValueChange} />);
    const input = screen.getByPlaceholderText("0,00");
    await userEvent.type(input, "ab5cd");
    expect(onValueChange).toHaveBeenLastCalledWith(0.05);
  });

  it("respeita disabled", () => {
    render(<CurrencyInput value={0} onValueChange={vi.fn()} disabled />);
    expect(screen.getByPlaceholderText("0,00")).toBeDisabled();
  });
});
