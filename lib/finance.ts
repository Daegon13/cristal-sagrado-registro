// Shared, side-effect-free accounting helpers. In UYU we store numeric(12,2) in DB;
// amounts here are intended for presentation, not replacing the original ledger.
export type MoneyMovement = { amount:number|string;kind:'payment'|'refund'|string;voided_at?:string|null };
export type CostMovement = { amount:number|string;voided_at?:string|null };
export const amount = (value:number|string)=>Number(value);
export function netReceived(payments: MoneyMovement[]): number {
  return payments.filter(x=>!x.voided_at).reduce((total,x)=>total+amount(x.amount)*(x.kind==='refund'?-1:1),0);
}
export function grossReceived(payments: MoneyMovement[]): number {
  return payments.filter(x=>!x.voided_at&&x.kind==='payment').reduce((total,x)=>total+amount(x.amount),0);
}
export function refundedTotal(payments: MoneyMovement[]): number {
  return payments.filter(x=>!x.voided_at&&x.kind==='refund').reduce((total,x)=>total+amount(x.amount),0);
}
export function costsRecorded(expenses: CostMovement[]): number {
  return expenses.filter(x=>!x.voided_at).reduce((total,x)=>total+amount(x.amount),0);
}
