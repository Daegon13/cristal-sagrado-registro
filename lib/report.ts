import 'server-only';
import { Resend } from 'resend';
import { database } from '@/lib/db';
import { addDays, utcBoundary } from '@/lib/time';
import { advertisingSummary } from '@/lib/ads';
import { deliverReport, latestReport, metricDifferences, reportHistory, ProviderRejectedError, type ReportDb, type ReportMode, type ReportData } from '@/lib/report-delivery';
import { reportEmail } from '@/lib/report-email';
import { reportDeliveryDisabled } from '@/lib/experiment-policy';

type Payment={id:string;sale_id:string;amount:string;method:string;kind:'payment'|'refund';received_at:string;source:string;contact_id:string};
type Expense={id:string;amount:string;category:string;occurred_on:string};
type Campaign={id:string;starts_on:string;ends_on:string;budget_kind:string;budget_amount:string};
type AdSpend={id:string;campaign_id:string|null;starts_on:string;ends_on:string;amount:string;voided_at:string|null};
const cents=(value:string)=>{const [units,decimals='']=String(value).split('.');return Number(units)*100+Number(decimals.padEnd(2,'0').slice(0,2));};
const uyu=(c:number)=>c/100;
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
  const paid=p.filter(x=>x.kind==='payment').reduce((n,x)=>n+cents(x.amount),0),refunded=p.filter(x=>x.kind==='refund').reduce((n,x)=>n+cents(x.amount),0),legacyAds=e.filter(x=>x.category==='ads').reduce((n,x)=>n+cents(x.amount),0),otherCosts=e.filter(x=>x.category!=='ads').reduce((n,x)=>n+cents(x.amount),0),costs=otherCosts+legacyAds+Math.round(ads.spent*100);
  const channels=['instagram','instagram_ads','web','referral','returning','other'];
  const data={schema:'cristal-sagrado-finanzas/v3',period:{start,end,timeZone:'America/Montevideo'},orgId,
    metrics:{inquiries:i.length,instagramInquiries:i.filter(x=>x.source==='instagram'||x.source==='instagram_ads').length,newSales:sales.rowCount||0,distinctPayingClients:new Set(p.filter(x=>x.kind==='payment').map(x=>x.contact_id)).size,grossPayments:uyu(paid),refunds:uyu(refunded),netReceived:uyu(paid-refunded),expenses:uyu(costs),otherExpenses:uyu(otherCosts),advertisingSpend:uyu(legacyAds)+ads.spent,legacyAdvertisingSpend:uyu(legacyAds),advertisingBudget:ads.budget,recordedCashDifference:uyu(paid-refunded-costs)},
    sources:Object.fromEntries(channels.map(ch=>[ch,i.filter(x=>x.source===ch).length])),
    revenueByReportedSource:Object.fromEntries(channels.map(ch=>[ch,uyu(p.filter(x=>x.source===ch).reduce((n,x)=>n+(x.kind==='refund'?-1:1)*cents(x.amount),0))])),
    payingClientsByReportedSource:Object.fromEntries(channels.map(ch=>[ch,new Set(p.filter(x=>x.kind==='payment'&&x.source===ch).map(x=>x.contact_id)).size])),
    expenseCategories:Object.fromEntries(['ads','materials','fees','other'].map(ch=>[ch,uyu(e.filter(x=>x.category===ch).reduce((n,x)=>n+cents(x.amount),0))])),
    integrity:{paymentRows:p.length,expenseRows:e.length,adSpendRows:adSpends.rows.length,legacyAdvertisingRows:e.filter(x=>x.category==='ads').length,inquiryRows:i.length,adSpendCrossingPeriodUnallocated:ads.unallocated,partialCampaignBudgetsUnallocated:ads.partialBudgets,advertisingPeriodComplete:ads.unallocated===0&&ads.partialBudgets===0&&legacyAds===0,countsAreEventsNotUniqueLeads:true,sourcesAreUserReportedNotVerifiedAdAttribution:true,advertisingExpensesManuallyEntered:true,bankReconciliationNotAutomated:true}};
  return {data,payments:p,expenses:e,adSpends:adSpends.rows};
}
export async function getReportStatus(orgId:string,start:string,end:string){
 const db=database() as unknown as ReportDb;
 const [current,previous,history]=await Promise.all([buildReport(orgId,start,end),latestReport(db,orgId,start,end),reportHistory(db,orgId,start,end)]);
 const snapshot=previous?.report_snapshot as ReportData|null;
 return {period:{start,end},current:current.data.metrics,
  previous:previous?{id:String(previous.id),revision:Number(previous.revision),status:String(previous.status),sentAt:previous.dispatched_at,hashPrefix:String(previous.report_hash).slice(0,12),hasSnapshot:!!snapshot}:null,
  differences:metricDifferences(snapshot,current.data),history};
}

export async function sendReport(orgId:string,start:string,end:string,mode:ReportMode){
 if(reportDeliveryDisabled)throw new Error('REPORT_DELIVERY_DISABLED');
 const key=process.env.RESEND_API_KEY,to=process.env.REPORT_TO_EMAIL,from=process.env.REPORT_FROM_EMAIL;
 if(!key||!to||!from)throw new Error('REPORT_NOT_CONFIGURED');
 let prepared:Awaited<ReturnType<typeof buildReport>>|undefined;
 return deliverReport(database() as unknown as ReportDb,{orgId,start,end,recipient:to,mode},
  async()=>{prepared=await buildReport(orgId,start,end);return prepared.data},
  async version=>{
   if(!prepared)throw new Error('REPORT_NOT_BUILT');
   const {data,payments,expenses,adSpends}=prepared;
   const {message,idempotencyKey}=reportEmail({from,to,orgId,start,end,reissue:mode.kind==='reissue',version,report:data,rows:{payments,expenses,adSpends}});
   const sent=await new Resend(key).emails.send(message,{idempotencyKey});
   if(sent.error||!sent.data)throw new ProviderRejectedError('RESEND_REJECTED');
   return sent.data.id;
  });
}
