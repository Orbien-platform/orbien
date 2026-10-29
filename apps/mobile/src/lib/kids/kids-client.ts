// KidsClient (módulo Kids, T30) — wrapper tipado sobre `authenticatedRequest`
// para `apps/api/src/kids/**`. Não duplica regra: faixa etária, consentimento,
// código e permissão são decididos pela API; aqui só se chama a rota e se
// traduz o erro em algo que a tela sabe mostrar.
import { authenticatedRequest } from "../auth/auth-client";
import { HttpError } from "../api/errors";
import type {
  AddKidsGuardianInput,
  CreateKidsChildInput,
  KidsChild,
  KidsCheckinQr,
  KidsChildFicha,
  KidsCheckinResult,
  KidsConsentStatus,
  KidsGuardian,
  KidsOpenCheckin,
  KidsRoster,
  KidsOpenSession,
  KidsRoom,
  KidsCheckoutResult,
  UpdateKidsGuardianInput,
} from "./types";

/** Recusa do check-out: o corpo do 403 é genérico de propósito (não diz se
 * foi o código ou quem retira). A mensagem da tela também. */
export const CHECKOUT_REFUSED_MESSAGE =
  "Este código não é de quem está buscando. Chame o líder kids.";

export async function listChildren(search?: string): Promise<KidsChild[]> {
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return authenticatedRequest<KidsChild[]>("get", `/kids/children${query}`);
}

export async function getChild(id: string): Promise<KidsChildFicha> {
  return authenticatedRequest<KidsChildFicha>("get", `/kids/children/${id}`);
}

export async function createChild(input: CreateKidsChildInput): Promise<KidsChild> {
  return authenticatedRequest<KidsChild>("post", "/kids/children", { body: input });
}

export async function addGuardian(childId: string, input: AddKidsGuardianInput): Promise<KidsGuardian> {
  return authenticatedRequest<KidsGuardian>("post", `/kids/children/${childId}/guardians`, {
    body: input,
  });
}

export async function updateGuardian(id: string, patch: UpdateKidsGuardianInput): Promise<KidsGuardian> {
  return authenticatedRequest<KidsGuardian>("patch", `/kids/guardians/${id}`, { body: patch });
}

export async function removeGuardian(id: string): Promise<void> {
  await authenticatedRequest<void>("delete", `/kids/guardians/${id}`);
}

export async function getConsentStatus(): Promise<KidsConsentStatus> {
  return authenticatedRequest<KidsConsentStatus>("get", "/kids/consent");
}

/** Aceita a versão do termo que a pessoa leu; a API recusa (409) se mudou. */
export async function acceptConsent(termVersion: string): Promise<void> {
  await authenticatedRequest<unknown>("post", "/kids/consent", { body: { term_version: termVersion } });
}

export async function revokeConsent(): Promise<void> {
  await authenticatedRequest<unknown>("post", "/kids/consent/revoke", { body: {} });
}

/**
 * Sessões abertas de HOJE. Gestão e responsável veem todas; o voluntário só as
 * que está escalado. Sem culto kids hoje, a lista vem vazia.
 */
export async function listOpenSessions(): Promise<KidsOpenSession[]> {
  return authenticatedRequest<KidsOpenSession[]>("get", "/kids/sessions/open");
}

export async function checkInChild(
  sessionId: string,
  input: { child_id: string; guardian_person_id: string; confirm_out_of_range?: boolean },
): Promise<KidsCheckinResult> {
  return authenticatedRequest<KidsCheckinResult>("post", `/kids/sessions/${sessionId}/checkins`, {
    body: input,
  });
}

/** O check-in aberto do filho com o código; `null` quando não há (404). */
export async function getOpenCheckin(childId: string): Promise<KidsOpenCheckin | null> {
  try {
    return await authenticatedRequest<KidsOpenCheckin>("get", `/kids/children/${childId}/checkin`);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

/**
 * QR de check-in do filho, emitido ao responsável: vale 5 minutos e uma única
 * leitura. A API recusa com 409 se a criança já está presente.
 */
export async function issueCheckinQr(childId: string): Promise<KidsCheckinQr> {
  return authenticatedRequest<KidsCheckinQr>("post", `/kids/children/${childId}/qr`, { body: {} });
}

/** "4:32" — o que falta do QR, em minutos e segundos; nunca negativo. */
export function formatCountdown(ms: number): string {
  const total = Math.max(Math.ceil(ms / 1000), 0);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export async function getRoster(sessionId: string): Promise<KidsRoster> {
  return authenticatedRequest<KidsRoster>("get", `/kids/sessions/${sessionId}/roster`);
}

export async function checkOut(
  checkinId: string,
  input: { code: string; picked_up_by_name: string },
): Promise<KidsCheckoutResult> {
  return authenticatedRequest<KidsCheckoutResult>("post", `/kids/checkins/${checkinId}/checkout`, {
    body: { code: input.code.trim().toUpperCase(), picked_up_by_name: input.picked_up_by_name.trim() },
  });
}

export async function checkOutOverride(
  checkinId: string,
  input: { reason: string; picked_up_by_name: string },
): Promise<KidsCheckoutResult> {
  return authenticatedRequest<KidsCheckoutResult>("post", `/kids/checkins/${checkinId}/checkout-override`, {
    body: { reason: input.reason.trim(), picked_up_by_name: input.picked_up_by_name.trim() },
  });
}

/** `code` do corpo de erro da API (`kids_consent_required`, `OUT_OF_RANGE_CONFIRM`...). */
export function kidsErrorCode(err: unknown): string | null {
  if (!(err instanceof HttpError)) return null;
  const body = err.body as { code?: unknown } | undefined;
  return typeof body?.code === "string" ? body.code : null;
}

/** Idade em meses completos — a mesma conta da faixa etária da API. */
export function ageInMonths(birthDateIso: string, now: Date = new Date()): number {
  const birth = new Date(birthDateIso);
  let months = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + (now.getUTCMonth() - birth.getUTCMonth());
  if (now.getUTCDate() < birth.getUTCDate()) months -= 1;
  return Math.max(months, 0);
}

/** "2 anos e 3 meses", "8 meses" — como o responsável fala da idade. */
export function formatAge(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return rest === 1 ? "1 mês" : `${rest} meses`;
  const y = years === 1 ? "1 ano" : `${years} anos`;
  if (rest === 0) return y;
  return `${y} e ${rest === 1 ? "1 mês" : `${rest} meses`}`;
}

type RoomSession = { status: string; room: Omit<KidsRoom, "capacity" | "id" | "name"> };

/** A turma cuja faixa contém a idade; sem ela, a primeira que aceita fora da faixa. */
export function suggestSession<T extends RoomSession>(sessions: T[], months: number): T | null {
  const open = sessions.filter((s) => s.status === "open");
  return (
    open.find((s) => months >= s.room.min_age_months && months <= s.room.max_age_months) ??
    open.find((s) => s.room.allows_out_of_range) ??
    null
  );
}

export function isInRange(session: RoomSession, months: number): boolean {
  return months >= session.room.min_age_months && months <= session.room.max_age_months;
}

/**
 * Mensagem de uma ação que falhou. As recusas de regra da API (400/409/422)
 * já vêm em português e dizem o que fazer ("a criança precisa de ao menos um
 * responsável principal"); o resto — rede, 500 — cai na mensagem genérica da
 * tela, que não inventa causa.
 */
export function describeKidsActionError(err: unknown, fallback: string): string {
  if (err instanceof HttpError && [400, 409, 422].includes(err.status) && !err.message.startsWith("HTTP ")) {
    return err.message;
  }
  return fallback;
}
