// Tipos puros do módulo Celebrações e OC (MOB-08) — espelham o shape de
// `ServiceOrdersService.findOne` e `CelebrationInstancesService.findAll`
// (`apps/api/src/celebrations/service-orders.service.ts:47-78`,
// `celebration-instances.service.ts:34-63`), sem importar código do Nest.
// Ver design.md, "Data Models".

export interface SetlistSongRef {
  id: string;
  sequence: number;
  title: string;
  key: string | null;
  key_alt: string | null;
  bpm: number | null;
  link: string | null;
  youtube_link: string | null;
  spotify_link: string | null;
  cifra_club_link: string | null;
}

export interface ServiceOrderItem {
  id: string;
  sequence: number;
  name: string;
  type: string;
  start_offset_minutes: number;
  duration_minutes: number;
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
    celebration: { id: string; name: string; type: string };
  };
  items: ServiceOrderItem[];
}

/** Item da lista de próximas celebrações (`ministry_leader`+, MOB-08-06). */
export interface CelebrationInstanceSummary {
  id: string;
  scheduled_date: string;
  celebration: { id: string; name: string; type: string };
  serviceOrder: { id: string; title: string; published_at: string | null } | null;
}
