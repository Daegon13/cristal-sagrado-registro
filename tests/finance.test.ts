import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { netReceived, grossReceived, refundedTotal, costsRecorded } from '../lib/finance.ts';

test('Seña + saldo - devolución real',()=>{
 const items=[{amount:1000,kind:'payment'},{amount:2000,kind:'payment'},{amount:500,kind:'refund'}];
 assert.equal(grossReceived(items),3000);
 assert.equal(refundedTotal(items),500);
 assert.equal(netReceived(items),2500);
});
test('Anular un error de carga no equivale a una devolución',()=>{
 const entries=[
  {amount:9000,kind:'payment',voided_at:'2026-11-15T12:00:00Z'},
  {amount:2900,kind:'payment'},
 ];
 assert.equal(netReceived(entries),2900);
 assert.equal(grossReceived(entries),2900);
});
test('Gastos anulados no reducen resultado parcial',()=>{
 assert.equal(costsRecorded([{amount:1000},{amount:5000,voided_at:'2026-11-15T12:00:00Z'}]),1000);
});
