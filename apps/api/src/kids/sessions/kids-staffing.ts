// Quem conta como escalado numa sessão kids: assignment pending ou confirmed
// (recusado e trocado não seguram a vaga — mesma regra do KidsSessionAccessService).
export const STAFFING_STATUSES = ['pending', 'confirmed'] as const;

type StaffingRow = {
  status: string;
  volunteer_profile_id: string;
  celebrationMinistry: { kids_session_id: string | null };
};

/** Voluntários DISTINTOS escalados (pending/confirmed) na sessão. */
export function countScheduledVolunteers(rows: StaffingRow[], sessionId: string): number {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.celebrationMinistry.kids_session_id !== sessionId) continue;
    if (!(STAFFING_STATUSES as readonly string[]).includes(r.status)) continue;
    ids.add(r.volunteer_profile_id);
  }
  return ids.size;
}

/** Quantos voluntários faltam para o mínimo da turma; nunca negativo. */
export function volunteersMissing(minVolunteers: number, scheduled: number): number {
  return Math.max(0, minVolunteers - scheduled);
}
