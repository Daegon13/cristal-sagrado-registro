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
export function utcBoundary(date: string): string {
  if(!isValidCalendarDate(date))throw new Error('Fecha inválida');
  const [year,month,day]=date.split('-').map(Number),target=Date.UTC(year,month-1,day);
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:MONTEVIDEO,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  let guess=target+3*3600000;
  for(let n=0;n<3;n++){
    const parts=Object.fromEntries(formatter.formatToParts(new Date(guess)).map(p=>[p.type,Number(p.value)]));
    const local=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
    const delta=target-local;if(delta===0)break;guess+=delta;
  }
  return new Date(guess).toISOString();
}
export function isValidCalendarDate(s: unknown): s is string {
  if(typeof s !== 'string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
}
