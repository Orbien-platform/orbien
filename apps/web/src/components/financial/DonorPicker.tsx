"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";

export interface DonorOption {
  id: string;
  full_name: string;
}

interface DonorPickerProps {
  id?: string;
  value: DonorOption | null;
  onChange: (donor: DonorOption | null) => void;
  disabled?: boolean;
}

/**
 * Busca uma `Person` existente por nome. O PIX recorrente exige pessoa já
 * cadastrada (`donor_person_id`) — não cria visitante aqui de propósito.
 */
export function DonorPicker({ id, value, onChange, disabled }: DonorPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DonorOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = query.trim();
    // Abaixo de 2 letras a lista nem é desenhada (ver o render), então não há
    // o que zerar aqui.
    if (term.length < 2) return;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      setSearching(true);
      setFailed(false);
      api
        .get<{ data: DonorOption[] }>(`/persons?search=${encodeURIComponent(term)}&limit=8`)
        .then((res) => {
          if (mine === seq.current) setResults(res.data.data ?? []);
        })
        .catch(() => {
          if (mine === seq.current) setFailed(true);
        })
        .finally(() => {
          if (mine === seq.current) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <div className="flex h-8 items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] px-2.5 text-sm text-ink dark:text-white">
        <span className="truncate">{value.full_name}</span>
        <button
          type="button"
          aria-label="Trocar doador"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          className="ml-2 flex h-5 w-5 items-center justify-center rounded text-stone hover:text-ink"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Input
        id={id}
        value={query}
        disabled={disabled}
        placeholder="Buscar pessoa pelo nome"
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim().length >= 2 && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)]">
          {searching ? (
            <p className="px-3 py-2 text-xs text-stone">Buscando…</p>
          ) : failed ? (
            <p role="alert" className="px-3 py-2 text-xs text-crimson">
              Erro na busca. Tente de novo.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-stone">
              Ninguém encontrado. A pessoa precisa estar cadastrada em Pessoas.
            </p>
          ) : (
            <ul>
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onChange(p)}
                    className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-[var(--surface-subtle)] dark:text-white"
                  >
                    {p.full_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
