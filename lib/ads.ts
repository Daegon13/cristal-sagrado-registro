type Campaign={starts_on:string;ends_on:string;budget_kind:string;budget_amount:string|number};
type Spend={starts_on:string;ends_on:string;amount:string|number;voided_at?:string|null};
const day=(date:string)=>Date.parse(date+'T00:00:00Z')/86400000;
export function advertisingSummary(start:string,end:string,campaigns:Campaign[],entries:Spend[]){
 let budget=0,spent=0,unallocated=0,partialBudgets=0;
 for(const c of campaigns){
  if(c.ends_on<start||c.starts_on>end)continue;
  if(c.budget_kind==='daily')budget+=Number(c.budget_amount)*(Math.min(day(end),day(c.ends_on))-Math.max(day(start),day(c.starts_on))+1);
  else if(c.starts_on>=start&&c.ends_on<=end)budget+=Number(c.budget_amount);
  else partialBudgets++;
 }
 for(const e of entries){
  if(e.voided_at||e.ends_on<start||e.starts_on>end)continue;
  if(e.starts_on>=start&&e.ends_on<=end)spent+=Number(e.amount);
  else unallocated++;
 }
 return {budget,spent,unallocated,partialBudgets,percent:budget>0?Math.round(spent/budget*100):null};
}
