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
  /** `start_time` ("HH:MM") é o horário do culto; `scheduled_date` é só o dia. */
  celebration: { id: string; name: string; start_time?: string };
  ministry: { id: string; name: string };
  scheduled_date: string;
  /** id da Ordem de Culto da celebração, ou `null` se ainda não existir (MOB-08-07). */
  service_order_id: string | null;
  setlist: { songs: SetlistSong[] } | null;
}

export interface Unavailability {
  dates: { date: string }[];
}

// Troca de escala (v2) — espelham `SwapCandidate`/`SwapRequestView` de
// `apps/api/src/celebrations/celebration-swap.service.ts`.

/**
 * `unavailable` junta "já escalado em outro ministério no mesmo culto" e
 * "marcou indisponibilidade na data": o voluntário vê que o colega não está
 * livre, não o motivo — esse fica com a liderança.
 */
export type CandidateAvailability = "free" | "unavailable";

export interface SwapCandidate {
  volunteer_profile_id: string;
  full_name: string;
  availability: CandidateAvailability;
}

export type SwapRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface SwapPerson {
  volunteer_profile_id: string;
  full_name: string;
}

export interface SwapRequest {
  id: string;
  status: SwapRequestStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
  assignment: {
    id: string;
    scheduled_date: string;
    celebration: { name: string; start_time: string };
    ministry: { id: string; name: string };
  };
  requester: SwapPerson;
  /** `null`: pedido aberto a qualquer um do ministério. */
  target: SwapPerson | null;
  accepted_by: SwapPerson | null;
}

export interface MySwapRequests {
  incoming: SwapRequest[];
  outgoing: SwapRequest[];
}

/** `GET /volunteers/me/profile`. */
export interface MyVolunteerProfile {
  id: string;
  ministries: { id: string; name: string; role: "leader" | "volunteer" }[];
  skills: string[];
  /** `{ sunday: ["morning", "evening"], ... }` — o formato de `CreateVolunteerProfileDto`. */
  availability: Record<string, string[]>;
  restrictions: string | null;
  volunteer_since: string;
  served_count: number;
}
