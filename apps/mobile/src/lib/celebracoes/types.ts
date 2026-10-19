// Tipos puros do módulo Celebrações e OC (MOB-08) — espelham o shape de
// `ServiceOrdersService.findOne` e `CelebrationInstancesService.findAll`
// (`apps/api/src/celebrations/service-orders.service.ts:47-78`,
// `celebration-instances.service.ts:34-63`), sem importar código do Nest.
// Ver design.md, "Data Models".

export interface SetlistSongRef {
  id: string;
  sequence: number;
  title: string;
  /** Versão escolhida para este culto; null em música avulsa ou setlist antiga. */
  version_label: string | null;
  key: string | null;
  bpm: number | null;
  link: string | null;
  songVersion: {
    id: string;
    label: string;
    key: string | null;
    bpm: number | null;
    youtube_link: string | null;
    spotify_link: string | null;
    cifra_club_link: string | null;
  } | null;
}

export type ItemPhase = "before" | "during" | "after";

export interface ServiceOrderItem {
  id: string;
  sequence: number;
  name: string;
  type: string;
  start_offset_minutes: number;
  duration_minutes: number;
  /** Ausente em OC antiga: vale `during`. */
  phase?: ItemPhase;
  /** `logistics` é tarefa de equipe ligada à escala, fora do tempo do programa. */
  entry_kind?: "program" | "logistics";
  /** Quem está na escala do ministério responsável, para esta celebração. */
  scheduled_volunteers?: { id: string; full_name: string; status: string }[];
  responsible_type: "person" | "ministry" | "free_text";
  person: { id: string; full_name: string } | null;
  ministry: { id: string; name: string } | null;
  responsible_label: string | null;
  notes: string | null;
  setlist: { songs: SetlistSongRef[] } | null;
}

export interface ServiceOrder {
  id: string;
  title: string;
  published_at: string | null;
  celebrationInstance: {
    id: string;
    scheduled_date: string;
    celebration: { id: string; name: string; type: string; start_time?: string };
  };
  items: ServiceOrderItem[];
}

/** Item da lista de próximas celebrações (`ministry_leader`+, MOB-08-06). */
export interface CelebrationInstanceSummary {
  id: string;
  scheduled_date: string;
  celebration: { id: string; name: string; type: string; start_time?: string };
  serviceOrder: { id: string; title: string; published_at: string | null } | null;
}

/** Item da agenda aberta a todo membro (`GET /celebrations/instances/upcoming`). */
export interface AgendaInstance {
  id: string;
  scheduled_date: string;
  celebration: { id: string; name: string; type: string; start_time: string };
}
