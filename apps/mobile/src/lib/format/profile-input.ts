// Máscaras e validação dos campos do modal de confirmação de cadastro
// (`ProfileGapsModal`). Sem seletor de data nativo no app, a nascença é
// digitada como DD/MM/AAAA e convertida para o ISO que a API espera.

/** `11988887777` → `(11) 98888-7777`. Aceita colagem com formatação. */
export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function phoneDigits(masked: string): string {
  return masked.replace(/\D/g, "");
}

/** Celular (11) ou fixo (10) com DDD. */
export function isValidPhone(masked: string): boolean {
  const digits = phoneDigits(masked);
  return digits.length === 10 || digits.length === 11;
}

/** `01011990` → `01/01/1990`. */
export function maskBirthDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * `DD/MM/AAAA` → `AAAA-MM-DD`, ou `null` se não for uma data real, for
 * futura ou anterior a 1900 (`29/02/2001` e `31/04/1990` não passam).
 */
export function parseBirthDate(masked: string, now: Date = new Date()): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() > today) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}
