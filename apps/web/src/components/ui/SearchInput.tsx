"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  placeholder?: string;
  defaultValue?: string;
  onSearch: (value: string) => void;
  debounce?: number;
  className?: string;
}

export function SearchInput({
  placeholder = "Buscar…",
  defaultValue = "",
  onSearch,
  debounce = 300,
  className,
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Último valor entregue ao pai — começa no `defaultValue`, que o pai já tem.
  // Sem isto o debounce emitia o valor inicial 300ms após montar, e quem
  // reseta a página no `onSearch` (Pessoas, Grupos) desfazia a navegação
  // feita nesse intervalo.
  const emittedRef = useRef(defaultValue);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (value === emittedRef.current) return;
    timerRef.current = setTimeout(() => {
      emittedRef.current = value;
      onSearch(value);
    }, debounce);
    return () => { clearTimeout(timerRef.current); };
  }, [value, debounce, onSearch]);

  return (
    <div className={cn("relative", className)}>
      <Search
        size={15}
        strokeWidth={1.5}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] py-1 pl-8 pr-3 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
      />
    </div>
  );
}
