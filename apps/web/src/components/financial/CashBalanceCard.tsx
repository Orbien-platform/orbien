"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CashBalance {
  as_of: string;
  balance: number;
  pending: { income: number; expense: number };
}

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

function dmy(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Caixa da congregação: tudo o que já entrou menos o que já saiu, do primeiro
 * lançamento até o fim do dia `asOf` (`GET /financial/dashboard/cash-balance`).
 * Só conta lançamento pago ou exportado — o "não pago" aparece à parte.
 *
 * Não segue filtro de tipo, categoria ou status: é um fato acumulado, não um
 * recorte. Refaz a busca quando `asOf` ou `reloadKey` mudam (a tela avança a
 * chave ao criar, editar, pagar ou excluir um lançamento), e uma resposta
 * que chega depois de a data já ter mudado é descartada.
 */
export function CashBalanceCard({ asOf, reloadKey = 0 }: { asOf: string; reloadKey?: number }) {
  const [data, setData] = useState<CashBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const lastKey = useRef<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    // Mesma data, mesma recarga = mesma busca (StrictMode roda o efeito 2x).
    const key = `${asOf}|${reloadKey}|${retry}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    const mine = ++seq.current;
    setLoading(true);
    api
      .get<CashBalance>(`/financial/dashboard/cash-balance?as_of=${asOf}`)
      .then((res) => {
        if (mine !== seq.current) return;
        setData(res.data);
        setAccessDenied(false);
        setLoadError(false);
      })
      .catch((error) => {
        if (mine !== seq.current) return;
        if (isForbidden(error)) setAccessDenied(true);
        else setLoadError(true);
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, [asOf, reloadKey, retry]);

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="Financeiro" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4 text-center">
        <p className="text-sm text-crimson">Erro ao carregar o caixa.</p>
        <button
          type="button"
          onClick={() => setRetry((n) => n + 1)}
          className="mt-1 text-sm font-medium text-navy underline underline-offset-2 dark:text-white"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const balance = data?.balance ?? 0;
  const pending = data?.pending;
  const hasPending = !!pending && (pending.income > 0 || pending.expense > 0);

  return (
    <section
      aria-label="Caixa"
      className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] px-5 py-4"
    >
      <p className="text-sm font-medium text-stone">Caixa em {dmy(asOf)}</p>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-44" />
      ) : (
        <p
          className={cn(
            "mt-1 text-3xl font-medium tabular-nums",
            balance >= 0 ? "text-teal" : "text-crimson",
          )}
        >
          {fmt(balance)}
        </p>
      )}
      <p className="mt-1 text-xs text-stone">
        Entradas menos saídas pagas, desde o primeiro lançamento. Não muda com os filtros.
      </p>
      {!loading && hasPending && pending && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone tabular-nums">
          {pending.income > 0 && <span>A receber {fmt(pending.income)}</span>}
          {pending.expense > 0 && <span>A pagar {fmt(pending.expense)}</span>}
        </p>
      )}
    </section>
  );
}
