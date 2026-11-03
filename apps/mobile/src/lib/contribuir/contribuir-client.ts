// Contribuir nativo (PROD-31, variante Starter) — sobre a doação pública
// `POST /financial/pix/public-donation` (apps/api/src/financial/pix.controller.ts),
// a mesma que `/doar/{slug}` no web usa. A rota é pública: o tenant vem do slug,
// não do token, e a resposta traz a chave PIX para o membro colar no app do
// banco. Nada aqui cobra: quem confirma o recebimento é o tesoureiro (PEND-14).
//
// A categoria é escolhida na lista da própria igreja (`GET
// /financial/pix/public-categories/:slug`) e viaja como `category_id`. O
// `category_slug` (palavra-chave) era da primeira versão do app e deixou de ser
// enviado; a API ainda o aceita para quem não atualizou.
import { apiClient } from "../api/client";

/** Espelho dos limites de `create-public-donation.dto.ts` — sem import entre
 * apps (CLAUDE.md). A autoridade é a API; aqui é só para avisar antes de enviar. */
export const MIN_AMOUNT = 5;
export const MAX_AMOUNT = 50_000;

/** Categoria de receita que a igreja oferece para contribuição. */
export interface DonationCategory {
  id: string;
  name: string;
  description: string | null;
}

// A lista muda raramente: guardada por igreja enquanto o app estiver aberto, a
// API ainda manda `Cache-Control` de 5 min. Só sucesso entra aqui — erro tenta
// de novo na próxima abertura.
const categoriesCache = new Map<string, DonationCategory[]>();

export async function fetchDonationCategories(tenantSlug: string): Promise<DonationCategory[]> {
  const cached = categoriesCache.get(tenantSlug);
  if (cached) return cached;
  const list = await apiClient.get<DonationCategory[]>(
    `/financial/pix/public-categories/${encodeURIComponent(tenantSlug)}`,
  );
  categoriesCache.set(tenantSlug, list);
  return list;
}

/** Descarta a lista guardada — para quando a API recusou um id que mudou. */
export function invalidateDonationCategories(tenantSlug: string): void {
  categoriesCache.delete(tenantSlug);
}

export interface DonationResult {
  mode?: "static" | "dynamic";
  pix_key: string;
  amount: number;
  church_name: string;
  transaction_ref: string;
  /** Só no dinâmico (Premium com cobrança liberada): o copia-e-cola do QR. */
  qr_code?: string;
}

export interface DonationInput {
  tenantSlug: string;
  amount: number;
  /** Sem id (igreja sem categorias de receita), a API lança em "Oferta". */
  categoryId?: string;
  /** Doação identificada leva o nome; anônima não manda nada. */
  donorName?: string;
}

export async function createDonation(input: DonationInput): Promise<DonationResult> {
  const donorName = input.donorName?.trim();
  return apiClient.post<DonationResult>("/financial/pix/public-donation", {
    body: {
      tenant_slug: input.tenantSlug,
      amount: input.amount,
      ...(input.categoryId ? { category_id: input.categoryId } : {}),
      ...(donorName ? { donor_name: donorName } : {}),
    },
  });
}

/** O que o membro cola no banco: o copia-e-cola do QR quando existe, senão a chave. */
export function pixCodeToCopy(result: DonationResult): string {
  return result.mode === "dynamic" && result.qr_code ? result.qr_code : result.pix_key;
}
