"use client";

import { useEffect, useRef, useState } from "react";
import api, { isForbidden } from "@/lib/api";
import { monthRangeOf, todayKey } from "@/lib/period";

export interface DreCategory {
  category_name: string;
  total: number;
  count: number;
}

export interface DreReport {
  period: { start: string; end: string };
  revenue: { categories: DreCategory[]; total: number };
  expenses: { categories: DreCategory[]; total: number };
  net_result: number;
  /** Lançamentos ainda não pagos/recebidos: informativo, fora do resultado. */
  pending?: { revenue_total: number; expenses_total: number };
  previous_period: {
    period: { start: string; end: string };
    revenue_total: number;
    expenses_total: number;
    net_result: number;
  };
}

export interface DreMatrixColumn {
  cost_center_id: string | null;
  name: string;
  revenue_total: number;
  expenses_total: number;
  net_result: number;
}

export interface DreMatrixRow {
  category_name: string;
  /** Por `cost_center_id`; "__none__" é o lançamento sem centro. */
  cells: Record<string, number>;
  total: number;
}

/** `GET /financial/dre/by-cost-center`: categorias × centros, só realizados. */
export interface DreMatrix {
  period: { start: string; end: string };
  columns: DreMatrixColumn[];
  revenue: DreMatrixRow[];
  expenses: DreMatrixRow[];
  totals: { revenue_total: number; expenses_total: number; net_result: number };
}

export interface CostCenterOption {
  id: string;
  name: string;
}

/** "" = todos; "none" = lançamentos sem centro; senão o id do centro. */
export const ALL_CENTERS = "";
export const NO_CENTER = "none";

/**
 * Estado da aba DRE. Vive na page, não no painel: a aba desmonta ao trocar, e
 * voltar para ela com o mesmo período não deve refazer a busca.
 */
export function useDreReport(active: boolean, isPastor: boolean) {
  const [start, setStart] = useState(() => monthRangeOf().start);
  const [end, setEnd] = useState(() => todayKey());
  const [costCenterId, setCostCenterId] = useState(ALL_CENTERS);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [dre, setDre] = useState<DreReport | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [matrix, setMatrix] = useState<DreMatrix | null>(null);
  const [matrixLoadedKey, setMatrixLoadedKey] = useState("");
  const [matrixDenied, setMatrixDenied] = useState(false);
  const prevMatrixKey = useRef("");
  const matrixSeq = useRef(0);
  const [accessDenied, setAccessDenied] = useState(false);
  const prevKey = useRef("");
  const requestSeq = useRef(0);
  const centersLoaded = useRef(false);

  useEffect(() => {
    if (!active || isPastor || centersLoaded.current) return;
    centersLoaded.current = true;
    api
      .get<CostCenterOption[]>("/financial/cost-centers")
      .then((r) => setCostCenters(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [active, isPastor]);

  const key = `${start}|${end}|${costCenterId}`;
  // Carregando = a chave pedida ainda não é a da última resposta aplicada
  // (mesmo padrão de `loadedTxKey` na page): sem setState síncrono no efeito.
  const loading = active && !!start && !!end && loadedKey !== key;

  useEffect(() => {
    if (!active || prevKey.current === key) return;
    prevKey.current = key;
    // Data apagada no input: não há período para pedir.
    if (!start || !end) return;
    const seq = ++requestSeq.current;
    const centerParam = costCenterId ? `&cost_center_id=${costCenterId}` : "";
    api
      .get<DreReport>(`/financial/dre?period_start=${start}&period_end=${end}${centerParam}`)
      .then((r) => {
        if (seq !== requestSeq.current) return;
        setDre(r.data);
        setAccessDenied(false);
      })
      .catch((error) => {
        if (seq !== requestSeq.current) return;
        if (isForbidden(error)) setAccessDenied(true);
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoadedKey(key);
      });
  }, [active, key, start, end, costCenterId]);

  // A matriz já é por centro: o filtro de centro não entra na chave dela.
  const matrixKey = `${start}|${end}`;
  const matrixLoading = active && !isPastor && !!start && !!end && matrixLoadedKey !== matrixKey;

  useEffect(() => {
    if (!active || isPastor || prevMatrixKey.current === matrixKey) return;
    prevMatrixKey.current = matrixKey;
    if (!start || !end) return;
    const seq = ++matrixSeq.current;
    api
      .get<DreMatrix>(`/financial/dre/by-cost-center?period_start=${start}&period_end=${end}`)
      .then((r) => {
        if (seq !== matrixSeq.current) return;
        // Resposta sem `columns` não é uma matriz: não fingimos uma.
        setMatrix(Array.isArray(r.data?.columns) ? r.data : null);
        setMatrixDenied(false);
      })
      .catch((error) => {
        if (seq !== matrixSeq.current) return;
        setMatrix(null);
        if (isForbidden(error)) setMatrixDenied(true);
      })
      .finally(() => {
        if (seq === matrixSeq.current) setMatrixLoadedKey(matrixKey);
      });
  }, [active, isPastor, matrixKey, start, end]);

  return {
    matrix,
    matrixLoading,
    matrixDenied,
    start,
    end,
    costCenterId,
    costCenters,
    dre,
    loading,
    accessDenied,
    setStart,
    setEnd,
    setCostCenterId,
  };
}

export type DreModel = ReturnType<typeof useDreReport>;
