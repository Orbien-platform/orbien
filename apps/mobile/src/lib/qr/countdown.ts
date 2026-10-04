// Tempo restante do QR de check-in, no formato que cabe embaixo do código:
// "3h 12min", "12 min", "45 s". Arredonda para baixo — o QR nunca promete
// um minuto que não tem.
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0 s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${String(minutes).padStart(2, "0")}min`;
}
