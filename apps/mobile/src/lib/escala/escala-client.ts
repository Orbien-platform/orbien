// EscalaClient (MOB-04) — wrapper tipado sobre `authenticatedRequest` para
// as rotas de escala/voluntários. Mesmo princípio de separação
// `*-client.ts` (lógica) vs. tela (UI) que `auth-client.ts`/
// `theme-provider.tsx` já seguem. Ver design.md, "Rodada 2 — MOB-04".
import { authenticatedRequest } from "../auth/auth-client";
import type {
  Assignment,
  AssignmentStatus,
  MySwapRequests,
  MyVolunteerProfile,
  SwapCandidate,
  SwapRequest,
  Unavailability,
} from "./types";

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

/** `GET /volunteers/unavailability?month=&year=` (MOB-05, AC 4). */
export async function getUnavailability(
  month: number,
  year: number,
): Promise<Unavailability | null> {
  return authenticatedRequest<Unavailability | null>(
    "get",
    `/volunteers/unavailability?month=${month}&year=${year}`,
  );
}

/**
 * `POST /volunteers/unavailability` (MOB-05, AC 4) — upsert: substitui o
 * mês inteiro (mesmo contrato de `CreateUnavailabilityDto`,
 * `apps/api/src/volunteers/dto/create-unavailability.dto.ts`).
 */
export async function saveUnavailability(
  referenceMonth: number,
  referenceYear: number,
  dates: string[],
  notes?: string,
): Promise<Unavailability> {
  return authenticatedRequest<Unavailability>("post", "/volunteers/unavailability", {
    body: { referenceMonth, referenceYear, dates, notes },
  });
}

/** `GET /assignments/:id/swap-candidates` — colegas do ministério que podem assumir. */
export async function getSwapCandidates(assignmentId: string): Promise<SwapCandidate[]> {
  return authenticatedRequest<SwapCandidate[]>(
    "get",
    `/assignments/${assignmentId}/swap-candidates`,
  );
}

/**
 * `POST /assignments/:id/swap-requests`. Sem `targetProfileId`, o pedido vai
 * para qualquer voluntário do ministério.
 */
export async function requestSwap(
  assignmentId: string,
  targetProfileId?: string,
  message?: string,
): Promise<SwapRequest> {
  return authenticatedRequest<SwapRequest>("post", `/assignments/${assignmentId}/swap-requests`, {
    body: {
      ...(targetProfileId ? { target_profile_id: targetProfileId } : {}),
      ...(message?.trim() ? { message: message.trim() } : {}),
    },
  });
}

/** `GET /volunteers/my-swap-requests` — pedidos para mim e os que enviei. */
export async function getMySwapRequests(): Promise<MySwapRequests> {
  return authenticatedRequest<MySwapRequests>("get", "/volunteers/my-swap-requests");
}

/** `PATCH /swap-requests/:id/{accept|decline|cancel}`. */
export async function respondToSwap(
  id: string,
  action: "accept" | "decline" | "cancel",
): Promise<SwapRequest> {
  return authenticatedRequest<SwapRequest>("patch", `/swap-requests/${id}/${action}`);
}

/** `GET /volunteers/me/profile` — leitura só; quem edita é a secretaria. */
export async function getMyVolunteerProfile(): Promise<MyVolunteerProfile> {
  return authenticatedRequest<MyVolunteerProfile>("get", "/volunteers/me/profile");
}
