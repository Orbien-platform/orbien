// Texto da disponibilidade semanal do perfil de voluntário — o JSON de
// `CreateVolunteerProfileDto` (`{ sunday: ["morning", "evening"], ... }`)
// vira "Dom manhã e noite, Qua noite", a linha de apoio de "Meu perfil".

const DAYS: [string, string][] = [
  ["sunday", "Dom"],
  ["monday", "Seg"],
  ["tuesday", "Ter"],
  ["wednesday", "Qua"],
  ["thursday", "Qui"],
  ["friday", "Sex"],
  ["saturday", "Sáb"],
];

const SLOTS: [string, string][] = [
  ["morning", "manhã"],
  ["afternoon", "tarde"],
  ["evening", "noite"],
];

/** "a", "a e b", "a, b e c". */
export function joinPt(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** `null` quando nenhum dia tem turno marcado. */
export function formatWeeklyAvailability(availability: Record<string, string[]>): string | null {
  const days = DAYS.flatMap(([key, label]) => {
    const marked = availability[key];
    const slots = SLOTS.filter(([slot]) => Array.isArray(marked) && marked.includes(slot)).map(
      ([, name]) => name,
    );
    return slots.length > 0 ? [`${label} ${joinPt(slots)}`] : [];
  });
  return days.length > 0 ? days.join(", ") : null;
}
