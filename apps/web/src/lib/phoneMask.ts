export function applyPhoneMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function stripPhone(masked: string): string {
  return masked.replace(/\D/g, "");
}

export function initPhone(rawFromApi?: string): string {
  if (!rawFromApi) return "";
  const digits = rawFromApi.replace(/\D/g, "");
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return applyPhoneMask(local);
}
