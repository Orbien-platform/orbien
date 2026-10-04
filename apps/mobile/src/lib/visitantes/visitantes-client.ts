// Cadastro de visitante pela liderança (v2, "Cadastrar visitante") — sobre
// `POST /visitors` (apps/api/src/visitor/visitor.leader.controller.ts), aberto
// ao líder de célula.
//
// O duplicado por telefone vem ANTES de criar: se o número já existe na
// igreja, a API devolve quem o tem e não grava nada. A tela então pergunta:
// é a mesma pessoa (`existing_person_id` — registra só a visita) ou é outra
// (`force_new` — cria mesmo assim)?
import { authenticatedRequest } from "../auth/auth-client";

export type VisitOrigin = "service" | "small_group" | "event" | "other";
export type VisitorGender = "female" | "male";

export interface NewVisitor {
  full_name: string;
  phone?: string;
  email?: string;
  gender?: VisitorGender;
  origin: VisitOrigin;
  small_group_id?: string;
}

export interface DuplicateMatch {
  id: string;
  full_name: string;
  classification: "visitor" | "attendee" | "member";
  visits: number;
  last_visit_at: string | null;
}

export type RegisterVisitorResult =
  | { status: "duplicate"; matches: DuplicateMatch[] }
  | {
      status: "registered" | "visit_recorded";
      person: { id: string; full_name: string };
      reclassified: boolean;
    };

/** Só dígitos e o `+` inicial — a API normaliza do mesmo jeito. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function visitorBody(input: NewVisitor) {
  const phone = input.phone ? normalizePhone(input.phone) : "";
  const email = input.email?.trim() ?? "";
  return {
    full_name: input.full_name.trim(),
    origin: input.origin,
    lgpd_consent: true,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(input.gender ? { gender: input.gender } : {}),
    ...(input.small_group_id ? { small_group_id: input.small_group_id } : {}),
  };
}

/** Primeira tentativa: cria, ou devolve os duplicados por telefone. Só é
 * chamada com o consentimento do visitante já marcado na tela. */
export function registerVisitor(input: NewVisitor): Promise<RegisterVisitorResult> {
  return authenticatedRequest<RegisterVisitorResult>("post", "/visitors", {
    body: visitorBody(input),
  });
}

/** "É outra pessoa": cria mesmo com o telefone repetido. */
export function registerVisitorAnyway(input: NewVisitor): Promise<RegisterVisitorResult> {
  return authenticatedRequest<RegisterVisitorResult>("post", "/visitors", {
    body: { ...visitorBody(input), force_new: true },
  });
}

/** "É a mesma pessoa": registra só a nova visita. */
export function recordVisitForExisting(
  personId: string,
  origin: VisitOrigin,
  smallGroupId?: string,
): Promise<RegisterVisitorResult> {
  return authenticatedRequest<RegisterVisitorResult>("post", "/visitors", {
    body: {
      existing_person_id: personId,
      origin,
      lgpd_consent: true,
      ...(smallGroupId ? { small_group_id: smallGroupId } : {}),
    },
  });
}
