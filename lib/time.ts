// Uruguay has used UTC-03 year-round in recent years. For dates that might be
// affected by future timezone law changes, server reporting should be updated.
export const MONTEVIDEO = 'America/Montevideo';
export function localToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MONTEVIDEO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) throw new Error('Fecha inválida');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function currentLocalWeek(now = new Date()) {
  const today = localToday(now);
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(today, -weekday);
  return { start, end: addDays(start, 6) };
}
export function previousClosedWeek(now = new Date()) {
  const today = localToday(now);
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(today, -weekday - 7);
  return { start, end: addDays(start, 6) };
}
export function utcBoundary(date: string): string { return `${date}T03:00:00.000Z`; }
export function isValidCalendarDate(s: unknown): s is string {
  if(typeof s !== 'string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
}
