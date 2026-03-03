/**
 * Credenciais do portal (WMI)
 * Regra: senha = DDMMAAAA * 9
 */

export function computePortalPasswordFromBirthDate(dateInput: string | Date): string | null {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;

  // Usar UTC para evitar off-by-one por timezone quando vem como ISO.
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  const base = `${dd}${mm}${yyyy}`;

  try {
    return (BigInt(base) * 9n).toString();
  } catch {
    return null;
  }
}
