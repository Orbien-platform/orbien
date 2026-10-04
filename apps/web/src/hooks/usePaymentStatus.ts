"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import api from "@/lib/api";

export type DonationPaymentStatus = "pending" | "confirmed" | "expired";

/** Intervalo entre consultas enquanto tudo corre bem. */
export const POLL_INTERVAL_MS = 4_000;
/** Teto do recuo quando a rede cai ou o servidor responde 429/5xx. */
export const POLL_MAX_BACKOFF_MS = 16_000;

interface PolledState {
  paymentId: string;
  status: DonationPaymentStatus;
}

/**
 * Espera a confirmação de uma doação pública (QR dinâmico) consultando
 * `GET /financial/pix/public-donation/:slug/:id` — o webhook da Asaas é a única
 * fonte de verdade, e o servidor não empurra nada para a página.
 *
 * - Só consulta com a aba visível; ao voltar, consulta na hora.
 * - Erro de rede, 429 e 5xx recuam (4 → 8 → 16 s) sem mostrar nada: o QR
 *   continua válido e o doador pode estar pagando.
 * - 404 (a doação não existe mais para esta igreja) e `expiresAt` vencido
 *   encerram como `expired`; `confirmed` e `expired` do servidor também. Depois
 *   de qualquer estado final, nenhuma consulta nova.
 *
 * Sem `paymentId` (doação estática ou ainda não criada) não faz nada.
 */
export function usePaymentStatus(
  slug: string,
  paymentId: string | null,
  expiresAt: string | null,
): DonationPaymentStatus {
  const [state, setState] = useState<PolledState | null>(null);

  useEffect(() => {
    if (!paymentId) return;

    const deadline = expiresAt ? new Date(expiresAt).getTime() : Infinity;
    let cancelled = false;
    let done = false;
    let inFlight = false;
    let delay = POLL_INTERVAL_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (status: DonationPaymentStatus) => {
      done = true;
      setState({ paymentId, status });
    };

    const schedule = () => {
      timer = setTimeout(poll, delay);
    };

    async function poll() {
      if (cancelled || done || inFlight) return;
      if (Date.now() >= deadline) {
        finish("expired");
        return;
      }
      // Aba em segundo plano: não gasta requisição. `onVisibility` retoma.
      if (document.visibilityState !== "visible") return;

      inFlight = true;
      try {
        const { data } = await api.get<{ status: DonationPaymentStatus }>(
          `/financial/pix/public-donation/${slug}/${paymentId}`,
        );
        inFlight = false;
        if (cancelled) return;
        if (data.status !== "pending") {
          finish(data.status);
          return;
        }
        delay = POLL_INTERVAL_MS;
      } catch (err) {
        inFlight = false;
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          finish("expired");
          return;
        }
        delay = Math.min(delay * 2, POLL_MAX_BACKOFF_MS);
      }
      schedule();
    }

    function onVisibility() {
      if (document.visibilityState !== "visible" || cancelled || done) return;
      clearTimeout(timer);
      void poll();
    }

    document.addEventListener("visibilitychange", onVisibility);
    schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [slug, paymentId, expiresAt]);

  // O estado de uma doação anterior não vaza para a seguinte.
  return state && state.paymentId === paymentId ? state.status : "pending";
}
