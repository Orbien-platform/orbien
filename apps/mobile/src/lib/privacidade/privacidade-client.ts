// Direitos do titular (LGPD, Art. 18 — `CONF-03`). Espelha as rotas `/me` de
// `apps/api/src/privacy/me-privacy.controller.ts`; todas operam sobre a pessoa
// da conta logada, nunca sobre um id passado aqui.
import { authenticatedRequest } from "../auth/auth-client";

export interface MyPerson {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  classification: "visitor" | "attendee" | "member";
}

export interface MyConsent {
  id: string;
  version: string;
  consented_at: string;
  origin: string | null;
  revoked_at: string | null;
}

export interface DeletionStatus {
  requested_at: string | null;
  anonymize_after: string | null;
  /** Só o pedido do próprio titular se cancela; a remoção feita pela igreja,
   * não. */
  cancellable: boolean;
}

export interface PersonalData {
  person: MyPerson;
  consents: MyConsent[];
  groups: Array<{ small_group_id: string; name: string; role: string }>;
  visits: Array<{ origin: string; visited_at: string }>;
  donations: Array<{ occurred_at: string; amount: string; category: string }>;
  deletion: DeletionStatus;
}

export type MyDataPatch = Partial<
  Pick<
    MyPerson,
    | "full_name"
    | "phone"
    | "birth_date"
    | "gender"
    | "address_street"
    | "address_number"
    | "address_complement"
    | "address_neighborhood"
    | "address_city"
    | "address_state"
    | "address_zip"
  >
>;

/** Nome legível de cada termo de consentimento (mapeamento LGPD, §3.1). */
const CONSENT_LABELS: Record<string, string> = {
  visitor_consent_v1: "Cadastro e contato pela igreja",
  member_consent_v1: "Cadastro de membro e dado religioso",
  staff_consent_v1: "Tratamento de dados em nome da igreja",
  donor_consent_v1: "Uso dos dados para recibo de doação",
  "dizimo-automatico-v1": "Dízimo automático por PIX",
};

export function consentLabel(version: string): string {
  return CONSENT_LABELS[version] ?? version;
}

export function getPersonalData(): Promise<PersonalData> {
  return authenticatedRequest<PersonalData>("get", "/me/personal-data");
}

/**
 * O id da `Person` da conta logada — o que a API usa como `guardian_person_id`
 * (Kids) e como valor da tag `person_id` do push. O token só carrega o id da
 * conta (`sub`), não o da pessoa; esta é a rota que o devolve.
 */
export async function getMyPersonId(): Promise<string> {
  return (await getPersonalData()).person.id;
}

/** O documento inteiro, como a API o entrega para portabilidade. */
export function exportPersonalData(): Promise<Record<string, unknown>> {
  return authenticatedRequest<Record<string, unknown>>("get", "/me/export");
}

export function updateMyData(patch: MyDataPatch): Promise<MyPerson> {
  return authenticatedRequest<MyPerson>("patch", "/me", { body: patch });
}

export function revokeConsent(version: string): Promise<{ revoked: number }> {
  return authenticatedRequest<{ revoked: number }>("post", "/me/revoke-consent", {
    body: { version },
  });
}

export function requestDeletion(): Promise<DeletionStatus> {
  return authenticatedRequest<DeletionStatus>("post", "/me/deletion-request");
}

export function cancelDeletion(): Promise<DeletionStatus> {
  return authenticatedRequest<DeletionStatus>("delete", "/me/deletion-request");
}

export type ProfileGap = "gender" | "phone" | "birth_date";

/**
 * O que falta no cadastro da pessoa da conta (`GET /me/profile-gaps`). Vazio
 * também quando não deu para perguntar: não se bloqueia a sessão por um dado
 * que não foi possível conferir. Nunca lança.
 */
export async function getProfileGaps(): Promise<ProfileGap[]> {
  try {
    const response = await authenticatedRequest<{ missing?: unknown }>("get", "/me/profile-gaps");
    return Array.isArray(response?.missing) ? (response.missing as ProfileGap[]) : [];
  } catch {
    return [];
  }
}
