import type { ReportData } from './report-delivery.ts';

type Version={revision:number;payload:string;digest:string};
type Rows={payments:Array<Record<string,unknown>>;expenses:Array<Record<string,unknown>>;adSpends:Array<Record<string,unknown>>};
type Summary={metrics:Record<string,number>;integrity:{advertisingPeriodComplete:boolean;adSpendCrossingPeriodUnallocated:number;partialCampaignBudgetsUnallocated:number;legacyAdvertisingRows:number}};
const csv=(rows:Record<string,unknown>[],fields:string[])=>[fields.join(','),...rows.map(row=>fields.map(field=>`"${String(row[field]??'').replace(/"/g,'""').replace(/^[=+@\-\t\r]/,"'$&")}"`).join(','))].join('\r\n');

export function reportEmail(input:{from:string;to:string;orgId:string;start:string;end:string;reissue:boolean;version:Version;report:ReportData&Summary;rows:Rows}){
 const {from,to,orgId,start,end,reissue,version,report,rows}=input,m=report.metrics,i=report.integrity;
 const summary=`Revisión ${version.revision}. Consultas: ${m.inquiries}; Cobrado neto: ${m.netReceived} UYU; Gastos registrados: ${m.expenses} UYU (publicidad: ${m.advertisingSpend} UYU; otros: ${m.otherExpenses} UYU); Diferencia parcial: ${m.recordedCashDifference} UYU. ${i.advertisingPeriodComplete?'Cobertura publicitaria sin períodos cruzados.':`Cobertura publicitaria incompleta: ${i.adSpendCrossingPeriodUnallocated} gastos cruzan el período y ${i.partialCampaignBudgetsUnallocated} presupuestos totales no se distribuyen; ${i.legacyAdvertisingRows} gastos anteriores de publicidad no se comparan con el presupuesto de campaña.`}`;
 const attachments=[
  {filename:`cs-informe-${start}-${end}-r${version.revision}.json`,content:Buffer.from(version.payload).toString('base64')},
  {filename:`cs-cobros-${start}-${end}-r${version.revision}.csv`,content:Buffer.from(csv(rows.payments.map(row=>({amount:row.amount,method:row.method,kind:row.kind,received_at:row.received_at,client_source:row.source})),['amount','method','kind','received_at','client_source'])).toString('base64')},
  {filename:`cs-gastos-${start}-${end}-r${version.revision}.csv`,content:Buffer.from(csv(rows.expenses,['amount','category','occurred_on'])).toString('base64')},
  {filename:`cs-publicidad-${start}-${end}-r${version.revision}.csv`,content:Buffer.from(csv(rows.adSpends.map(row=>({...row,included_in_totals:String(row.starts_on)>=start&&String(row.ends_on)<=end})),['campaign_id','starts_on','ends_on','amount','included_in_totals'])).toString('base64')},
 ];
 return {message:{from,to,subject:`[CS-FINANZAS] ${start} a ${end} · revisión ${version.revision} · ${version.digest.slice(0,10)}`,text:`Informe financiero Cristal Sagrado\nPeríodo: ${start} a ${end} (Montevideo)\n${summary}\n${reissue?'Reemisión administrativa. ':''}Diferencia parcial: no representa beneficio fiscal ni conciliación bancaria.\nHash: ${version.digest}`,attachments},idempotencyKey:`cs-finanzas/${orgId}/financial/${start}/${end}/r${version.revision}`};
}
