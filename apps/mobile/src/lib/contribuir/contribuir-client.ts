// Contribuir nativo (PROD-31, variante Starter) — sobre a doação pública
// `POST /financial/pix/public-donation` (apps/api/src/financial/pix.controller.ts),
// a mesma que `/doar/{slug}` no web usa. A rota é pública: o tenant vem do slug,
// não do token, e a resposta traz a chave PIX para o membro colar no app do
// banco. Nada aqui cobra: quem confirma o recebimento é o tesoureiro (PEND-14).
//
// A categoria viaja como palavra-chave (`category_slug`): a API procura uma
// categoria de receita cujo nome contém o termo e cai em "Oferta" quando não
// acha. Por isso a lista abaixo é fixa e usa termos que o seed da igreja já tem.
import { apiClient } from "../api/client";

/** Espelho dos limites de `create-public-donation.dto.ts` — sem import entre
 * apps (CLAUDE.md). A autoridade é a API; aqui é só para avisar antes de enviar. */
export const MIN_AMOUNT = 5;
export const MAX_AMOUNT = 50_000;

export type DonationCategory = "dizimo" | "oferta" | "missoes";

export const DONATION_CATEGORIES: { value: DonationCategory; label: string; keyword: string }[] = [
  { value: "dizimo", label: "Dízimo", keyword: "dízimo" },
  { value: "oferta", label: "Oferta", keyword: "oferta" },
  { value: "missoes", label: "Missões", keyword: "missionária" },
];

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
  category: DonationCategory;
  /** Doação identificada leva o nome; anônima não manda nada. */
  donorName?: string;
}

export async function createDonation(input: DonationInput): Promise<DonationResult> {
  const keyword = DONATION_CATEGORIES.find((c) => c.value === input.category)?.keyword;
  const donorName = input.donorName?.trim();
  return apiClient.post<DonationResult>("/financial/pix/public-donation", {
    body: {
      tenant_slug: input.tenantSlug,
      amount: input.amount,
      ...(keyword ? { category_slug: keyword } : {}),
      ...(donorName ? { donor_name: donorName } : {}),
    },
  });
}

/** O que o membro cola no banco: o copia-e-cola do QR quando existe, senão a chave. */
export function pixCodeToCopy(result: DonationResult): string {
  return result.mode === "dynamic" && result.qr_code ? result.qr_code : result.pix_key;
}
