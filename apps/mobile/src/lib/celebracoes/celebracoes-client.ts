// CelebracoesClient (MOB-08) — wrapper tipado sobre `authenticatedRequest`
// para a aba Celebrações e a tela de detalhe da OC. Mesmo princípio de
// separação `*-client.ts` (lógica) vs. tela (UI) que `escala-client.ts`/
// `content-client.ts` já seguem — não duplica validação, só chama a rota.
import { authenticatedRequest } from "../auth/auth-client";
import type { CelebrationInstanceSummary, ServiceOrder } from "./types";

/**
 * `GET /celebrations/instances?date_from=hoje` (MOB-08-06) — só para
 * `ministry_leader`+, que a tela decide antes de chamar (design.md, Tech
 * Decisions). `date_from` reusa o filtro que o DTO já aceita, sem flag
 * "upcoming" nova.
 */
export async function listUpcomingInstances(): Promise<CelebrationInstanceSummary[]> {
  const todayIso = new Date().toISOString().slice(0, 10);
  return authenticatedRequest<CelebrationInstanceSummary[]>(
    "get",
    `/celebrations/instances?date_from=${todayIso}`,
  );
}

/** `GET /celebrations/orders/:id` (MOB-08-02) — OC + itens + setlist aninhados. */
export async function getServiceOrder(id: string): Promise<ServiceOrder> {
  return authenticatedRequest<ServiceOrder>("get", `/celebrations/orders/${id}`);
}
