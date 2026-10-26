import axios from "axios";
import api from "@/lib/api";

/**
 * Cliente do módulo Kids (turmas, sessões, criança, check-in/out).
 *
 * Tipos e rotas espelham `apps/api/src/kids/**`. Nada de regra aqui: quem
 * decide faixa etária, consentimento e retirada é a API; este arquivo só fala
 * com ela e traduz o que as telas precisam ler do erro.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface KidsRoom {
  id: string;
  name: string;
  min_age_months: number;
  max_age_months: number;
  allows_out_of_range: boolean;
  capacity: number | null;
  min_volunteers: number;
  is_active: boolean;
}

export interface KidsRoomInput {
  name: string;
  min_age_months: number;
  max_age_months: number;
  allows_out_of_range: boolean;
  capacity: number | null;
  min_volunteers: number;
}

export interface KidsSession {
  id: string;
  status: "open" | "cancelled";
  celebration_instance_id: string;
  room_id: string;
  room: KidsRoom;
  volunteers_scheduled: number;
  volunteers_missing: number;
}

export interface KidsTemplate {
  celebration_id: string;
  room_ids: string[];
  rooms: KidsRoom[];
}

export interface KidsTemplateApplied {
  instances: number;
  created: number;
  already_open: number;
  skipped_rooms: number;
}

export interface KidsChild {
  id: string;
  full_name: string;
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

export interface KidsFicha extends KidsChild {
  allergies: string | null;
  medical_notes: string | null;
  guardians: KidsGuardian[];
}

export interface KidsChildInput {
  full_name: string;
  birth_date: string;
  allergies?: string;
  medical_notes?: string;
  relationship?: string;
  guardian_person_id?: string;
  register_consent?: boolean;
}

export interface KidsChildPatch {
  full_name?: string;
  birth_date?: string;
  allergies?: string | null;
  medical_notes?: string | null;
}

export interface KidsGuardianInput {
  guardian_person_id?: string;
  full_name?: string;
  phone?: string;
  relationship: string;
  can_pickup?: boolean;
  is_primary?: boolean;
}

export interface KidsGuardianPatch {
  relationship?: string;
  can_pickup?: boolean;
  is_primary?: boolean;
}

export interface KidsConsentStatus {
  valid: boolean;
  term_version: string;
  term_text: string;
}

export interface KidsLabels {
  checkin_id: string;
  child_label: {
    child_name: string;
    room_name: string;
    has_allergy: boolean;
    allergy: string | null;
    code: string;
  };
  guardian_label: { child_name: string; room_name: string; code: string };
}

export interface KidsCheckinResult {
  id: string;
  session_id: string;
  child_id: string;
  guardian_person_id: string;
  code: string;
  checked_in_at: string;
  age_override: boolean;
  capacity_warning: { capacity: number; present: number } | null;
  labels: KidsLabels;
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

export interface KidsRoster {
  session: {
    id: string;
    status: "open" | "cancelled";
    celebration_instance_id: string;
    room: { id: string; name: string; capacity: number | null };
  };
  present_count: number;
  items: KidsRosterItem[];
}

export interface KidsOpenCheckin {
  id: string;
  session_id: string;
  room: { id: string; name: string };
  checked_in_at: string;
  code: string;
}

export interface KidsAttendanceSummary {
  period: { date_from: string; date_to: string };
  sessions_counted: number;
  rooms: {
    room_id: string;
    room_name: string;
    sessions_counted: number;
    total_children: number;
    average_children: number;
  }[];
}

// ─── Código de retirada ───────────────────────────────────────────────────────

/** Mesmo alfabeto do servidor: sem 0/O/1/I/L, que se confundem na etiqueta. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;

/**
 * O que foi digitado, já no formato do código: maiúsculas, só o alfabeto, até
 * 4 caracteres. Letra fora do alfabeto some em vez de virar erro — o servidor
 * trata qualquer código errado como a mesma recusa.
 */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((c) => CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, CODE_LENGTH);
}

// ─── Idade e faixa ────────────────────────────────────────────────────────────

/** Meses completos entre o nascimento e `now` (UTC), como o servidor calcula. */
export function ageInMonths(birth: string | Date, now: Date = new Date()): number {
  const b = new Date(birth);
  let months = (now.getUTCFullYear() - b.getUTCFullYear()) * 12 + (now.getUTCMonth() - b.getUTCMonth());
  if (now.getUTCDate() < b.getUTCDate()) months -= 1;
  return Math.max(months, 0);
}

/** "8 meses", "1 ano", "2 anos e 3 meses". */
export function formatAge(months: number): string {
  if (months < 12) return months === 1 ? "1 mês" : `${months} meses`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 1 ? "1 ano" : `${years} anos`;
  if (rest === 0) return y;
  return `${y} e ${rest === 1 ? "1 mês" : `${rest} meses`}`;
}

/** Faixa da turma na unidade em que a igreja a pensa: anos cheios ou meses. */
export function formatAgeRange(min: number, max: number): string {
  if (min % 12 === 0 && (max + 1) % 12 === 0) {
    const from = min / 12;
    const to = (max + 1) / 12 - 1;
    return from === to ? `${from} ${from === 1 ? "ano" : "anos"}` : `${from} a ${to} anos`;
  }
  return `${min} a ${max} meses`;
}

// ─── Erros ────────────────────────────────────────────────────────────────────

/** O `code` que a API põe no corpo de alguns 4xx (`OUT_OF_RANGE_CONFIRM`…). */
export function kidsErrorCode(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const code: unknown = err.response?.data?.code;
  return typeof code === "string" ? code : null;
}

export function kidsErrorStatus(err: unknown): number | null {
  return axios.isAxiosError(err) ? (err.response?.status ?? null) : null;
}

// ─── Turmas ───────────────────────────────────────────────────────────────────

export async function listRooms(includeInactive = false): Promise<KidsRoom[]> {
  const { data } = await api.get<KidsRoom[]>("/kids/rooms", {
    params: includeInactive ? { include_inactive: true } : undefined,
  });
  return Array.isArray(data) ? data : [];
}

export async function createRoom(input: KidsRoomInput): Promise<KidsRoom> {
  const { data } = await api.post<KidsRoom>("/kids/rooms", input);
  return data;
}

export async function updateRoom(id: string, patch: Partial<KidsRoomInput> & { is_active?: boolean }): Promise<KidsRoom> {
  const { data } = await api.patch<KidsRoom>(`/kids/rooms/${id}`, patch);
  return data;
}

export async function deactivateRoom(id: string): Promise<KidsRoom> {
  const { data } = await api.delete<KidsRoom>(`/kids/rooms/${id}`);
  return data;
}

// ─── Sessões e modelo ─────────────────────────────────────────────────────────

export async function listSessions(instanceId: string): Promise<KidsSession[]> {
  const { data } = await api.get<KidsSession[]>(`/celebrations/instances/${instanceId}/kids-sessions`);
  return Array.isArray(data) ? data : [];
}

export async function openSessions(instanceId: string, roomIds: string[]): Promise<void> {
  await api.post(`/celebrations/instances/${instanceId}/kids-sessions`, { room_ids: roomIds });
}

export async function cancelSession(sessionId: string): Promise<void> {
  await api.delete(`/kids/sessions/${sessionId}`);
}

export async function getTemplate(celebrationId: string): Promise<KidsTemplate> {
  const { data } = await api.get<KidsTemplate>(`/celebrations/${celebrationId}/kids-template`);
  return data;
}

export async function setTemplate(celebrationId: string, roomIds: string[]): Promise<void> {
  await api.post(`/celebrations/${celebrationId}/kids-template`, { room_ids: roomIds });
}

export async function applyTemplate(celebrationId: string): Promise<KidsTemplateApplied> {
  const { data } = await api.post<KidsTemplateApplied>(`/celebrations/${celebrationId}/kids-template/apply`, {});
  return data;
}

// ─── Criança, responsáveis, consentimento ─────────────────────────────────────

export async function searchChildren(search: string): Promise<KidsChild[]> {
  const { data } = await api.get<KidsChild[]>("/kids/children", {
    params: search.trim() ? { search: search.trim() } : undefined,
  });
  return Array.isArray(data) ? data : [];
}

export async function getChild(id: string): Promise<KidsFicha> {
  const { data } = await api.get<KidsFicha>(`/kids/children/${id}`);
  return data;
}

export async function createChild(input: KidsChildInput): Promise<KidsChild> {
  const { data } = await api.post<KidsChild>("/kids/children", input);
  return data;
}

export async function updateChild(id: string, patch: KidsChildPatch): Promise<KidsChild> {
  const { data } = await api.patch<KidsChild>(`/kids/children/${id}`, patch);
  return data;
}

export interface PersonOption {
  id: string;
  full_name: string;
  phone?: string | null;
}

/** Adultos já cadastrados, para escolher o responsável de uma criança nova. */
export async function searchPersons(search: string): Promise<PersonOption[]> {
  const { data } = await api.get<{ data: PersonOption[] }>("/persons", {
    params: { search: search.trim(), limit: 8 },
  });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function addGuardian(childId: string, input: KidsGuardianInput): Promise<void> {
  await api.post(`/kids/children/${childId}/guardians`, input);
}

export async function updateGuardian(id: string, patch: KidsGuardianPatch): Promise<void> {
  await api.patch(`/kids/guardians/${id}`, patch);
}

export async function removeGuardian(id: string): Promise<void> {
  await api.delete(`/kids/guardians/${id}`);
}

export async function getConsent(guardianPersonId: string): Promise<KidsConsentStatus> {
  const { data } = await api.get<KidsConsentStatus>("/kids/consent", {
    params: { guardian_person_id: guardianPersonId },
  });
  return data;
}

export async function registerConsent(guardianPersonId: string, termVersion: string): Promise<void> {
  await api.post("/kids/consent", { guardian_person_id: guardianPersonId, term_version: termVersion });
}

export async function revokeConsent(guardianPersonId: string): Promise<void> {
  await api.post("/kids/consent/revoke", { guardian_person_id: guardianPersonId });
}

// ─── Check-in e check-out ─────────────────────────────────────────────────────

export async function checkIn(
  sessionId: string,
  body: { child_id: string; guardian_person_id: string; confirm_out_of_range?: boolean },
): Promise<KidsCheckinResult> {
  const { data } = await api.post<KidsCheckinResult>(`/kids/sessions/${sessionId}/checkins`, body);
  return data;
}

export async function getRoster(sessionId: string): Promise<KidsRoster> {
  const { data } = await api.get<KidsRoster>(`/kids/sessions/${sessionId}/roster`);
  return data;
}

export async function getLabels(checkinId: string): Promise<KidsLabels> {
  const { data } = await api.get<KidsLabels>(`/kids/checkins/${checkinId}/labels`);
  return data;
}

export async function checkOut(
  checkinId: string,
  body: { code: string; picked_up_by_person_id: string },
): Promise<void> {
  await api.post(`/kids/checkins/${checkinId}/checkout`, body);
}

export async function checkOutOverride(
  checkinId: string,
  body: { reason: string; picked_up_by_name: string },
): Promise<void> {
  await api.post(`/kids/checkins/${checkinId}/checkout-override`, body);
}

// ─── Indicador ────────────────────────────────────────────────────────────────

export async function getAttendanceSummary(params: {
  date_from: string;
  date_to: string;
}): Promise<KidsAttendanceSummary> {
  const { data } = await api.get<KidsAttendanceSummary>("/kids/attendance/summary", { params });
  return data;
}
