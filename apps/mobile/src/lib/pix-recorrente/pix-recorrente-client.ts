// PixRecorrenteClient (PROD-28) — dízimo automático do próprio doador,
// `GET/POST/PATCH /me/pix-subscriptions`. Mesmo princípio `*-client.ts`
// (lógica) vs. tela (UI) de `notification-preferences-client.ts`.
//
// Tudo isto está atrás da trava `ASAAS_PAYMENTS_ENABLED` da API: com ela
// desligada (o padrão, para todo tenant), a Home nem mostra a entrada e o
// POST responde 503. Ver `docs/PLANO.md`, PROD-28.
import { authenticatedRequest } from "../auth/auth-client";

/** Espelho dos limites de `apps/api/src/financial/donor-pix-subscriptions.constants.ts`
 * — sem import cruzado entre apps (CLAUDE.md). A autoridade é a API; aqui é
 * só para avisar antes de enviar. */
export const MIN_AMOUNT = 10;
export const MAX_AMOUNT = 5000;

/** Versão do texto de aceite mostrado na tela. Mudou o texto, muda a versão —
 * aqui e na API, juntos. */
export const CONSENT_VERSION = "dizimo-automatico-v1";

export interface DonorPixPayment {
  id: string;
  /** Decimal do Prisma chega como string no JSON. */
  amount: string | number;
  paid_at: string | null;
}

export interface DonorPixSubscription {
  id: string;
  amount: string | number;
  status: "active" | "cancelled";
  created_at: string;
  cancelled_at: string | null;
  payments: DonorPixPayment[];
}

export async function listMySubscriptions(): Promise<DonorPixSubscription[]> {
  return authenticatedRequest<DonorPixSubscription[]>("get", "/me/pix-subscriptions");
}

export async function createMySubscription(amount: number): Promise<{ id: string }> {
  return authenticatedRequest<{ id: string }>("post", "/me/pix-subscriptions", {
    body: { amount, consent_version: CONSENT_VERSION },
  });
}

export async function cancelMySubscription(id: string): Promise<{ id: string; status: string }> {
  return authenticatedRequest<{ id: string; status: string }>(
    "patch",
    `/me/pix-subscriptions/${id}/cancel`,
  );
}

/**
 * A trava de pagamentos está ligada? Lê `features.asaas_payments` de
 * `GET /me/permissions`. **Fail-closed**, ao contrário de `fetchAreas`: sem
 * resposta, a entrada não aparece — mostrar um recurso que vai responder 503
 * é pior do que escondê-lo por um carregamento. Nunca lança.
 */
export async function fetchAsaasPaymentsEnabled(): Promise<boolean> {
  try {
    const response = await authenticatedRequest<{ features?: { asaas_payments?: unknown } }>(
      "get",
      "/me/permissions",
    );
    return response?.features?.asaas_payments === true;
  } catch {
    return false;
  }
}

/** Valor digitado ("150", "150,50", "1.500,00") → número, ou `null` se não for valor. */
export function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}
