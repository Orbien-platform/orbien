// Tipos puros de escala/indisponibilidade (MOB-04, MOB-05) — espelham o
// shape de `getMyAssignments` (`apps/api/src/celebrations/celebration-
// assignment.service.ts:353-370`) e o contrato de
// `CreateUnavailabilityDto`/`VolunteerUnavailability`
// (`apps/api/src/volunteers/`), sem importar código do Nest. Ver
// design.md, "Rodada 2 — MOB-04", Data Models.

export type AssignmentStatus = "pending" | "confirmed" | "declined" | "swapped";

export interface SetlistSong {
  id: string;
  sequence: number;
  title: string;
  key: string | null;
  bpm: number | null;
  link: string | null;
}

export interface Assignment {
  id: string;
  status: AssignmentStatus;
  notified_at: string | null;
  responded_at: string | null;
  checked_in_at: string | null;
  celebration: { id: string; name: string };
  ministry: { id: string; name: string };
  scheduled_date: string;
  /** id da Ordem de Culto da celebração, ou `null` se ainda não existir (MOB-08-07). */
  service_order_id: string | null;
  setlist: { songs: SetlistSong[] } | null;
}

export interface Unavailability {
  dates: { date: string }[];
}
