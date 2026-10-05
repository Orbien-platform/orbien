// Tipos puros do módulo Pequenos Grupos (MOB-09) — espelham os shapes de
// `SmallGroupsService.findMine`, `MeetingsService.findByGroup/findOne/
// listMaterials` e `SmallGroupsService.findOne` (roster), sem importar
// código do Nest. Ver design.md, "Data Models".

export interface SmallGroupMine {
  id: string;
  name: string;
  meeting_time: string | null;
  recurrence: string | null;
  role: "leader" | "trainee" | "member";
}

export interface GroupMeetingSummary {
  id: string;
  occurred_at: string;
  topic: string | null;
}

export interface GroupMeetingDetail {
  id: string;
  small_group_id: string;
  occurred_at: string;
  topic: string | null;
  attendanceRecords: Array<{ person_id: string }>;
}

export interface MeetingMaterial {
  id: string;
  visibility: "all" | "leaders_only";
  material: {
    id: string;
    title: string;
    source_type: "pdf" | "doc" | "rich_text";
    file_url: string | null;
    rich_content: string | null;
  };
}

export interface GroupRosterMember {
  person_id: string;
  full_name: string;
  role: "leader" | "trainee" | "member";
}

/** `MeetingsService.createCheckinToken` — `expires_at` em ISO. */
export interface CheckinToken {
  token: string;
  expires_at: string;
}

/** `MeetingsService.checkin`. */
export interface CheckinResult {
  status: "checked_in" | "already_checked_in";
  group_meeting_id: string;
}

/** Quantas células há em cada cor do semáforo (`GET /small-groups/health-summary`). */
export interface HealthSummary {
  green: number;
  yellow: number;
  red: number;
  total: number;
}
