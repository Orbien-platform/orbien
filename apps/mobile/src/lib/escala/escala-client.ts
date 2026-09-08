// EscalaClient (MOB-04) — wrapper tipado sobre `authenticatedRequest` para
// as rotas de escala/voluntários. Mesmo princípio de separação
// `*-client.ts` (lógica) vs. tela (UI) que `auth-client.ts`/
// `theme-provider.tsx` já seguem. Ver design.md, "Rodada 2 — MOB-04".
import { authenticatedRequest } from "../auth/auth-client";
import type { Assignment, AssignmentStatus } from "./types";

/** `GET /volunteers/my-celebration-assignments` (MOB-04, AC 1). */
export async function getMyAssignments(includePast?: boolean): Promise<Assignment[]> {
  const query = includePast ? "?includePast=true" : "";
  return authenticatedRequest<Assignment[]>(
    "get",
    `/volunteers/my-celebration-assignments${query}`,
  );
}

/**
 * `PATCH /assignments/:id/respond` (MOB-04, AC 2) — confirma ou recusa um
 * slot pendente. Não duplica validação: só chama a rota, a API já decide
 * a regra de negócio (design.md).
 */
export async function respondToAssignment(
  id: string,
  status: Extract<AssignmentStatus, "confirmed" | "declined">,
): Promise<Assignment> {
  return authenticatedRequest<Assignment>("patch", `/assignments/${id}/respond`, {
    body: { status },
  });
}

/**
 * `PATCH /assignments/:id/check-in` (MOB-04, AC 3) — sem body: o
 * timestamp de check-in é sempre "agora", resolvido no servidor (design.md,
 * Tech Decisions).
 */
export async function checkIn(id: string): Promise<Assignment> {
  return authenticatedRequest<Assignment>("patch", `/assignments/${id}/check-in`);
}
