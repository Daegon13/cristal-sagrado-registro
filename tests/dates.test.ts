import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { addDays, previousClosedWeek, currentLocalWeek, isValidCalendarDate, localToday } from '../lib/time.ts';

test('Semanas lunes-domingo en horario de Uruguay',()=>{
  assert.deepEqual(currentLocalWeek(new Date('2026-11-15T05:00:00Z')),{start:'2026-11-09',end:'2026-11-15'});
  assert.deepEqual(previousClosedWeek(new Date('2026-11-16T12:00:00Z')),{start:'2026-11-09',end:'2026-11-15'});
});
test('Cambia el día a las 03 UTC',()=>{
  assert.equal(localToday(new Date('2026-11-15T02:59:00Z')),'2026-11-14');
  assert.equal(localToday(new Date('2026-11-15T03:00:00Z')),'2026-11-15');
});
test('Fechas inválidas no deben aceptarse',()=>{
  assert.equal(isValidCalendarDate('2026-02-31'),false);
  assert.equal(isValidCalendarDate('2026-11-15'),true);
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
});
