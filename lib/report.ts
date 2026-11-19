import 'server-only';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { database } from '@/lib/db';
import { addDays, utcBoundary } from '@/lib/time';
import { advertisingSummary } from '@/lib/ads';

type Payment={id:string;sale_id:string;amount:string;method:string;kind:'payment'|'refund';received_at:string;source:string;contact_id:string};
type Expense={id:string;amount:string;category:string;occurred_on:string};
type Campaign={id:string;starts_on:string;ends_on:string;budget_kind:string;budget_amount:string};
type AdSpend={id:string;campaign_id:string|null;starts_on:string;ends_on:string;amount:string;voided_at:string|null};
const cents=(value:string)=>{const [units,decimals='']=String(value).split('.');return Number(units)*100+Number(decimals.padEnd(2,'0').slice(0,2));};
const uyu=(c:number)=>c/100;
const csv=(rows:Record<string,unknown>[],fields:string[])=>[fields.join(','),...rows.map(r=>fields.map(f=>`"${String(r[f]??'').replace(/"/g,'""').replace(/^[=+@\-\t\r]/,"'$&")}"`).join(','))].join('\r\n');
export async function buildReport(orgId:string,start:string,end:string){
  const db=database(),from=utcBoundary(start),until=utcBoundary(addDays(end,1));
  const client=await db.connect();
  let inquiries,sales,payments,expenses,campaigns,adSpends;
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   inquiries=await client.query<{source:string}>('SELECT source FROM inquiries WHERE org_id=$1 AND created_at >= $2 AND created_at < $3',[orgId,from,until]);
   sales=await client.query<{id:string}>("SELECT id FROM sales WHERE org_id=$1 AND status<>'cancelled' AND created_at >= $2 AND created_at < $3",[orgId,from,until]);
   payments=await client.query<Payment>('SELECT p.id,p.sale_id,p.amount::text,p.method,p.kind,p.received_at::text,c.source,c.id AS contact_id FROM payments p JOIN sales s ON s.id=p.sale_id AND s.org_id=p.org_id JOIN contacts c ON c.id=s.contact_id AND c.org_id=s.org_id WHERE p.org_id=$1 AND p.voided_at IS NULL AND p.received_at >= $2 AND p.received_at < $3 ORDER BY p.id',[orgId,from,until]);
   expenses=await client.query<Expense>('SELECT id,amount::text,category,occurred_on::text FROM expenses WHERE org_id=$1 AND voided_at IS NULL AND occurred_on >= $2::date AND occurred_on <= $3::date ORDER BY id',[orgId,start,end]);
   campaigns=await client.query<Campaign>('SELECT id,starts_on::text,ends_on::text,budget_kind,budget_amount::text FROM ad_campaigns WHERE org_id=$1 AND starts_on <= $3::date AND ends_on >= $2::date',[orgId,start,end]);
   adSpends=await client.query<AdSpend>('SELECT id,campaign_id,starts_on::text,ends_on::text,amount::text,voided_at::text FROM ad_spend_entries WHERE org_id=$1 AND voided_at IS NULL AND starts_on <= $3::date AND ends_on >= $2::date',[orgId,start,end]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  const i=inquiries.rows,p=payments.rows,e=expenses.rows,ads=advertisingSummary(start,end,campaigns.rows,adSpends.rows);
  const paid=p.filter(x=>x.kind==='payment').reduce((n,x)=>n+cents(x.amount),0),refunded=p.filter(x=>x.kind==='refund').reduce((n,x)=>n+cents(x.amount),0),costs=e.reduce((n,x)=>n+cents(x.amount),0)+Math.round(ads.spent*100);
  const channels=['instagram','instagram_ads','web','referral','returning','other'];
  const data={schema:'cristal-sagrado-finanzas/v2',period:{start,end,timeZone:'America/Montevideo'},orgId,
    metrics:{inquiries:i.length,instagramInquiries:i.filter(x=>x.source==='instagram'||x.source==='instagram_ads').length,newSales:sales.rowCount,distinctPayingClients:new Set(p.filter(x=>x.kind==='payment').map(x=>x.contact_id)).size,grossPayments:uyu(paid),refunds:uyu(refunded),netReceived:uyu(paid-refunded),expenses:uyu(costs),otherExpenses:uyu(costs-Math.round(ads.spent*100)),advertisingSpend:ads.spent,advertisingBudget:ads.budget,recordedCashDifference:uyu(paid-refunded-costs)},
    sources:Object.fromEntries(channels.map(ch=>[ch,i.filter(x=>x.source===ch).length])),
    revenueByReportedSource:Object.fromEntries(channels.map(ch=>[ch,uyu(p.filter(x=>x.source===ch).reduce((n,x)=>n+(x.kind==='refund'?-1:1)*cents(x.amount),0))])),
    payingClientsByReportedSource:Object.fromEntries(channels.map(ch=>[ch,new Set(p.filter(x=>x.kind==='payment'&&x.source===ch).map(x=>x.contact_id)).size])),
    expenseCategories:Object.fromEntries(['ads','materials','fees','other'].map(ch=>[ch,uyu(e.filter(x=>x.category===ch).reduce((n,x)=>n+cents(x.amount),0))])),
    integrity:{paymentRows:p.length,expenseRows:e.length,adSpendRows:adSpends.rows.length,inquiryRows:i.length,adSpendCrossingPeriodUnallocated:ads.unallocated,partialCampaignBudgetsUnallocated:ads.partialBudgets,advertisingPeriodComplete:ads.unallocated===0&&ads.partialBudgets===0,countsAreEventsNotUniqueLeads:true,sourcesAreUserReportedNotVerifiedAdAttribution:true,advertisingExpensesManuallyEntered:true,bankReconciliationNotAutomated:true}};
  const payload=JSON.stringify(data),digest=createHash('sha256').update(payload).digest('hex');
  return {data,payload,digest,payments:p,expenses:e,adSpends:adSpends.rows};
}
export async function sendReport(orgId:string,start:string,end:string,actor:string|null){
  const key=process.env.RESEND_API_KEY,to=process.env.REPORT_TO_EMAIL,from=process.env.REPORT_FROM_EMAIL;
  if(!key||!to||!from) throw new Error('REPORT_NOT_CONFIGURED');
  const {data,payload,digest,payments,expenses,adSpends}=await buildReport(orgId,start,end),db=database();
  const reserved=await db.query<{id:string}>("INSERT INTO report_dispatches(org_id,start_date,end_date,recipient,report_hash,status,actor) VALUES($1,$2,$3,$4,$5,'pending',$6) ON CONFLICT(org_id,start_date,end_date,report_hash) DO NOTHING RETURNING id",[orgId,start,end,to,digest,actor]);
  if(!reserved.rows[0]){
    const prior=await db.query<{status:string;dispatched_at:string|null}>('SELECT status,dispatched_at FROM report_dispatches WHERE org_id=$1 AND start_date=$2 AND end_date=$3 AND report_hash=$4',[orgId,start,end,digest]);
    if(prior.rows[0]?.status==='sent') return {ok:true,alreadySent:true,at:prior.rows[0].dispatched_at};
    throw new Error('REPORT_PENDING');
  }
  const summary=`Consultas: ${data.metrics.inquiries}; Cobrado neto: ${data.metrics.netReceived} UYU; Gastos registrados: ${data.metrics.expenses} UYU (publicidad: ${data.metrics.advertisingSpend} UYU; otros: ${data.metrics.otherExpenses} UYU); Diferencia parcial: ${data.metrics.recordedCashDifference} UYU. ${data.integrity.advertisingPeriodComplete?'Cobertura publicitaria sin períodos cruzados.':`Cobertura publicitaria incompleta: ${data.integrity.adSpendCrossingPeriodUnallocated} gastos cruzan el período y ${data.integrity.partialCampaignBudgetsUnallocated} presupuestos totales no se distribuyen.`}`;
  const attachments=[
    {filename:`cs-informe-${start}-${end}.json`,content:Buffer.from(payload).toString('base64')},
    {filename:`cs-cobros-${start}-${end}.csv`,content:Buffer.from(csv(payments.map(x=>({amount:x.amount,method:x.method,kind:x.kind,received_at:x.received_at,client_source:x.source})),['amount','method','kind','received_at','client_source'])).toString('base64')},
    {filename:`cs-gastos-${start}-${end}.csv`,content:Buffer.from(csv(expenses,['amount','category','occurred_on'])).toString('base64')},
    {filename:`cs-publicidad-${start}-${end}.csv`,content:Buffer.from(csv(adSpends,['campaign_id','starts_on','ends_on','amount'])).toString('base64')},
  ];
  const sent=await new Resend(key).emails.send({from,to,subject:`[CS-FINANZAS] ${start} a ${end} · ${digest.slice(0,10)}`,text:`Informe financiero Cristal Sagrado\nPeríodo: ${start} a ${end} (Montevideo)\n${summary}\nDiferencia parcial: no representa beneficio fiscal ni conciliación bancaria.\nHash: ${digest}`,attachments},{idempotencyKey:`cs-finanzas/${orgId}/${digest}`});
  if(sent.error||!sent.data){await db.query("UPDATE report_dispatches SET status='failed',error_code=$1 WHERE id=$2",['RESEND_REJECTED',reserved.rows[0].id]);throw new Error('REPORT_SEND_FAILED');}
  await db.query("UPDATE report_dispatches SET status='sent',provider_id=$1,dispatched_at=now() WHERE id=$2",[sent.data.id,reserved.rows[0].id]);
  return {ok:true,mailId:sent.data.id,reportHash:digest};
}
