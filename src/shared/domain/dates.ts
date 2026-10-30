/** Lokales Datum als `YYYY-MM-DD` (Schweizer Kalendertag des Benutzers). */
export function localIsoDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Addiert Tage zu einem `YYYY-MM-DD`-Datum (kalenderecht, ohne Zeitzonenfehler). */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** `2026-03-31` → `31.03.2026` */
export function formatDateCh(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}
