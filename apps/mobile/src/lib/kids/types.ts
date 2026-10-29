// Tipos do módulo Kids — espelham os retornos de `apps/api/src/kids/**`
// (children, guardians, consent, checkin, roster), sem importar código do Nest.

export interface KidsChild {
  id: string;
  full_name: string;
  /** ISO; `null` em criança cadastrada sem data (o check-in pede antes). */
  birth_date: string | null;
  household_id: string | null;
}

export interface KidsGuardian {
  id: string;
  guardian_person_id: string;
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  relationship: string;
  can_pickup: boolean;
  is_primary: boolean;
}

/** `GET /kids/children/:id` — criança, saúde e autorizados. */
export interface KidsChildFicha extends KidsChild {
  allergies: string | null;
  medical_notes: string | null;
  guardians: KidsGuardian[];
}

export interface CreateKidsChildInput {
  full_name: string;
  /** `AAAA-MM-DD`. */
  birth_date: string;
  allergies?: string;
  medical_notes?: string;
  relationship?: string;
}

export interface AddKidsGuardianInput {
  full_name: string;
  phone: string;
  relationship: string;
  can_pickup?: boolean;
  is_primary?: boolean;
}

export interface UpdateKidsGuardianInput {
  relationship?: string;
  can_pickup?: boolean;
  is_primary?: boolean;
}

/** `GET /kids/consent` — termo vigente e se o responsável já aceitou. */
export interface KidsConsentStatus {
  valid: boolean;
  term_version: string;
  term_text: string;
}

export interface KidsRoom {
  id: string;
  name: string;
  min_age_months: number;
  max_age_months: number;
  allows_out_of_range: boolean;
  capacity: number | null;
}

export interface KidsSession {
  id: string;
  status: "open" | "cancelled";
  room: KidsRoom;
}

/** `GET /kids/sessions/open` — sessão aberta de HOJE, com o culto a que pertence. */
export interface KidsOpenSession {
  session_id: string;
  status: "open";
  room: Omit<KidsRoom, "capacity">;
  instance: {
    id: string;
    scheduled_date: string;
    celebration_name: string;
    /** `HH:mm`; `null` quando o culto não tem horário. */
    start_time: string | null;
  };
}

export interface KidsCheckinResult {
  id: string;
  session_id: string;
  child_id: string;
  code: string;
  age_override: boolean;
  capacity_warning: { capacity: number; present: number } | null;
}

/** `GET /kids/children/:id/checkin` — o check-in aberto, com o código. */
export interface KidsOpenCheckin {
  id: string;
  session_id: string;
  room: { id: string; name: string };
  checked_in_at: string;
  code: string;
}

export interface KidsRosterItem {
  checkin_id: string;
  checked_in_at: string;
  age_override: boolean;
  child: { id: string; full_name: string; birth_date: string | null };
  guardian: { person_id: string; full_name: string };
  has_allergy: boolean;
  allergies: string | null;
}

/** `GET /kids/sessions/:id/roster` — note: sem `code`; a equipe não relê o código. */
export interface KidsRoster {
  session: { id: string; status: string; room: { id: string; name: string; capacity: number | null } };
  present_count: number;
  items: KidsRosterItem[];
}

export interface KidsCheckoutResult {
  id: string;
  checked_out_at: string;
  picked_up_by_name: string;
}

/** `POST /kids/children/:id/qr` — QR de check-in do responsável (5 min, uso único). */
export interface KidsCheckinQr {
  qr: string;
  child_id: string;
  guardian_person_id: string;
  /** ISO. */
  expires_at: string;
  ttl_seconds: number;
}
