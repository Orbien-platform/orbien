// PequenosGruposClient (MOB-09) — wrapper tipado sobre `authenticatedRequest`
// pras telas de Grupos. Mesmo princípio de separação `*-client.ts` (lógica)
// vs. tela (UI) que `celebracoes-client.ts`/`escala-client.ts` já seguem.
import { authenticatedRequest } from "../auth/auth-client";
import type {
  GroupMeetingDetail,
  GroupMeetingSummary,
  GroupRosterMember,
  MeetingMaterial,
  SmallGroupMine,
} from "./types";

/** `GET /small-groups/mine` (MOB-09-01). */
export async function listMyGroups(): Promise<SmallGroupMine[]> {
  return authenticatedRequest<SmallGroupMine[]>("get", "/small-groups/mine");
}

/** `GET /small-groups/:groupId/meetings` (MOB-09-03). */
export async function listMeetings(groupId: string): Promise<GroupMeetingSummary[]> {
  return authenticatedRequest<GroupMeetingSummary[]>("get", `/small-groups/${groupId}/meetings`);
}

/** `GET /small-groups/meetings/:meetingId` (MOB-09-06). */
export async function getMeeting(meetingId: string): Promise<GroupMeetingDetail> {
  return authenticatedRequest<GroupMeetingDetail>("get", `/small-groups/meetings/${meetingId}`);
}

/** `GET /small-groups/meetings/:meetingId/materials` (MOB-09-04). */
export async function listMaterials(meetingId: string): Promise<MeetingMaterial[]> {
  return authenticatedRequest<MeetingMaterial[]>(
    "get",
    `/small-groups/meetings/${meetingId}/materials`,
  );
}

/** `GET /small-groups/:groupId` (MOB-09-06) — só o roster (`memberships.person`) interessa aqui. */
export async function getGroupRoster(groupId: string): Promise<GroupRosterMember[]> {
  const group = await authenticatedRequest<{
    memberships: Array<{ role: GroupRosterMember["role"]; person: { id: string; full_name: string } }>;
  }>("get", `/small-groups/${groupId}`);
  return group.memberships.map((m) => ({
    person_id: m.person.id,
    full_name: m.person.full_name,
    role: m.role,
  }));
}

/** `POST /small-groups/meetings/:meetingId/attendance` (MOB-09-07). */
export async function recordAttendance(
  meetingId: string,
  personIds: string[],
): Promise<{ added: number }> {
  return authenticatedRequest<{ added: number }>(
    "post",
    `/small-groups/meetings/${meetingId}/attendance`,
    { body: { person_ids: personIds } },
  );
}
