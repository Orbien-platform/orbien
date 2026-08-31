"use client";

import { Input } from "@/components/ui/input";

interface CurrencyInputProps {
  id?: string;
  value: number;
  onValueChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

function formatReais(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CurrencyInput({
  id,
  value,
  onValueChange,
  disabled,
  className,
}: CurrencyInputProps) {
  const cents = Math.round(value * 100);
  const display = cents === 0 ? "" : formatReais(cents / 100);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    const newCents = digits === "" ? 0 : parseInt(digits, 10);
    onValueChange(newCents / 100);
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder="0,00"
      value={display}
      onChange={handleChange}
      disabled={disabled}
      className={className}
    />
  );
}
