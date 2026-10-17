// Horário de relógio das etapas da OC. A API guarda cada etapa como minutos
// desde o início do culto (negativo é antes); a tela soma ao `start_time` da
// celebração para mostrar "09:30".

/** "HH:mm" + minutos (positivos ou negativos), dando a volta na meia-noite. */
export function addMinutesToClock(clock: string | undefined | null, minutes: number): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock ?? "");
  if (!match) return null;
  const total = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Sem horário de início conhecido: "30min antes", "1h depois do início". */
export function formatOffsetFromStart(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const label = h > 0 ? (m > 0 ? `${h}h${m}min` : `${h}h`) : `${m}min`;
  return minutes < 0 ? `${label} antes` : label;
}
