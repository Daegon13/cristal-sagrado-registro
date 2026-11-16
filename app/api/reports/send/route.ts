import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { isValidCalendarDate, localToday, addDays, utcBoundary } from '@/lib/time';
import { netReceived, grossReceived, refundedTotal, costsRecorded } from '@/lib/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fail = (message: string, code: number) => NextResponse.json({error:message},{status:code,headers:{'Cache-Control':'no-store'}});
const escapeHtml=(s:unknown)=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const csvField=(value:unknown)=>`"${String(value??'').replace(/"/g,'""').replace(/^[=+@\-\t\r]/,'\u0027$&')}"`;
const csv=(rows:Record<string,unknown>[],fields:string[])=>[fields.join(','),...rows.map(r=>fields.map(f=>csvField(r[f])).join(','))].join('\r\n');
const num=(v:unknown)=>Number(v||0);
const safeEqual = (a:string,b:string) => {const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)};
export async function POST(request:NextRequest){
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if(!token) return fail('Iniciá sesión antes de enviar informes.',401);
  const cronSecret=process.env.CRON_SECRET;
  const asCron=Boolean(cronSecret&&safeEqual(token,cronSecret));
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey=process.env.RESEND_API_KEY,to=process.env.REPORT_TO_EMAIL,from=process.env.REPORT_FROM_EMAIL;
  if(!url||!anon||!service||!apiKey||!to||!from) return fail('Faltan variables del servidor para enviar informes.',503);
  let body:unknown;
  try{body=await request.json();}catch{return fail('JSON inválido.',400)}
  if(!body||typeof body!=='object') return fail('Solicitud inválida.',400);
  const {start,end,orgId} = body as {start?:string;end?:string;orgId?:string};
  if(!isValidCalendarDate(start)||!isValidCalendarDate(end)||!orgId||end<start||end>localToday()) return fail('Fechas incorrectas o futuras.',400);
  if(asCron && (!process.env.REPORT_ORG_ID||orgId!==process.env.REPORT_ORG_ID)) return fail('Organización no autorizada para el cierre automático.',403);
  const span=(Date.parse(end!)-Date.parse(start!))/86400000;
  if(span>35) return fail('Máximo 36 días por informe.',400);
  let actorId: string|null=null;
  if(!asCron){
    const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userResult,error:authError}=await auth.auth.getUser(token);
    if(authError||!userResult.user) return fail('Sesión inválida.',401);
    actorId=userResult.user.id;
  }
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(actorId){
    const member=await db.from('memberships').select('role').eq('org_id',orgId).eq('user_id',actorId).maybeSingle();
    if(member.error||!member.data) return fail('No autorizado para esta organización.',403);
  }
  const fromUtc=utcBoundary(start),untilUtc=utcBoundary(addDays(end,1));
  const [contacts,inquiries,sales,payments,expenses] = await Promise.all([
    db.from('contacts').select('id,alias,source,created_at',{count:'exact'}).eq('org_id',orgId),
    db.from('inquiries').select('id,contact_id,source,created_at',{count:'exact'}).eq('org_id',orgId).gte('created_at',fromUtc).lt('created_at',untilUtc),
    db.from('sales').select('id,contact_id,service,agreed_amount,status,created_at',{count:'exact'}).eq('org_id',orgId),
    db.from('payments').select('id,sale_id,amount,method,kind,received_at',{count:'exact'}).eq('org_id',orgId).is('voided_at',null).gte('received_at',fromUtc).lt('received_at',untilUtc),
    db.from('expenses').select('id,amount,category,occurred_on',{count:'exact'}).eq('org_id',orgId).is('voided_at',null).gte('occurred_on',start).lte('occurred_on',end)
  ]);
  if([contacts,inquiries,sales,payments,expenses].some(x=>x.error)) return fail('No se pudieron obtener los datos completos. No se envió el informe.',500);
  if([contacts,inquiries,sales,payments,expenses].some(x=>(x.count??0)>(x.data?.length??0))) return fail('El informe excede el límite de registros por consulta: no se enviarán datos incompletos. Requiere exportación paginada.',422);
  const c=contacts.data||[],i=inquiries.data||[],s=sales.data||[],p=payments.data||[],e=expenses.data||[];
  const salesById=new Map(s.map(x=>[x.id,x]));const contactById=new Map(c.map(x=>[x.id,x]));
  const paid=grossReceived(p);
  const refunded=refundedTotal(p);
  const costs=costsRecorded(e);
  const distinctPayers=new Set(p.filter(x=>x.kind==='payment').map(x=>salesById.get(x.sale_id)?.contact_id).filter(Boolean));
  const newlySold=s.filter(x=>x.status!=='cancelled'&&x.created_at>=fromUtc&&x.created_at<untilUtc);
  const channels=['instagram','instagram_ads','web','referral','returning','other'];
  const originOf=(payment:{sale_id:string}) => contactById.get(salesById.get(payment.sale_id)?.contact_id||'')?.source||'other';
  const revenueBySource=Object.fromEntries(channels.map(channel=>[channel,p.filter(x=>originOf(x)===channel).reduce((sum,x)=>sum+(x.kind==='refund'?-1:1)*num(x.amount),0)]));
  const payingClientsBySource=Object.fromEntries(channels.map(channel=>[channel,new Set(p.filter(x=>x.kind==='payment'&&originOf(x)===channel).map(x=>salesById.get(x.sale_id)?.contact_id).filter(Boolean)).size]));
  const data={schema:'cristal-sagrado-finanzas/v1',period:{start,end,timeZone:'America/Montevideo'},orgId,
    metrics:{inquiries:i.length,instagramInquiries:i.filter(x=>x.source==='instagram'||x.source==='instagram_ads').length,newSales:newlySold.length,distinctPayingClients:distinctPayers.size,grossPayments:paid,refunds:refunded,netReceived:netReceived(p),expenses:costs,recordedCashDifference:paid-refunded-costs},
    sources:Object.fromEntries(channels.map(x=>[x,i.filter(q=>q.source===x).length])),
    revenueByReportedSource:revenueBySource,payingClientsByReportedSource:payingClientsBySource,
    expenseCategories:Object.fromEntries(['ads','materials','fees','other'].map(x=>[x,e.filter(q=>q.category===x).reduce((v,q)=>v+num(q.amount),0)])),
    integrity:{paymentRows:p.length,expenseRows:e.length,inquiryRows:i.length,countsAreEventsNotUniqueLeads:true,sourcesAreUserReportedNotVerifiedAdAttribution:true,advertisingExpensesManuallyEntered:true,bankReconciliationNotAutomated:true},
  };
  const payload=JSON.stringify(data); const digest=createHash('sha256').update(payload).digest('hex');
  const preexisting=await db.from('report_dispatches').select('id,dispatched_at').eq('org_id',orgId).eq('start_date',start!).eq('end_date',end!).eq('report_hash',digest).order('dispatched_at',{ascending:false}).limit(1);
  if(preexisting.data?.length) return NextResponse.json({ok:true,alreadySent:true,at:preexisting.data[0].dispatched_at});
  // Use only aggregate data in report body: no personally identifying client aliases or names.
  const summary=`Consultas: ${i.length}; Clientes que pagaron: ${distinctPayers.size}; Cobrado: ${paid-refunded} UYU; Gastos registrados: ${costs} UYU; Diferencia parcial: ${paid-refunded-costs} UYU`;
  const reportId=randomUUID();
  const message=await new Resend(apiKey).emails.send({
    from,to,subject:`[CS-FINANZAS] ${start} a ${end} · ${digest.slice(0,10)}`,
    html:`<h2>Informe financiero Cristal Sagrado</h2><p>Período: ${escapeHtml(start)} a ${escapeHtml(end)} (Montevideo)</p><p>${escapeHtml(summary)}</p><p>Advertencia: la diferencia parcial no equivale a beneficio neto ni a conciliación bancaria. Gastos de Meta se registran manualmente.</p><h3>Datos estructurados</h3><pre>${escapeHtml(payload)}</pre><p>Versión de datos: ${escapeHtml(digest)}</p>`,
    attachments:[
      {filename:`cs-informe-${start}-${end}.json`,content:Buffer.from(payload).toString('base64')},
      {filename:`cs-cobros-${start}-${end}.csv`,content:Buffer.from(csv(p.map(x=>({...x,client_source:contactById.get(salesById.get(x.sale_id)?.contact_id||'')?.source||'other'})),['id','sale_id','amount','method','kind','received_at','client_source']),'utf8').toString('base64')},
      {filename:`cs-gastos-${start}-${end}.csv`,content:Buffer.from(csv(e,['id','amount','category','occurred_on']),'utf8').toString('base64')}
    ],
    headers:{'X-Entity-Ref-ID':reportId},
  }, {idempotencyKey:`cs-finanzas/${digest}`});
  if(message.error||!message.data) return fail('El proveedor de correo rechazó el envío.',502);
  const logged=await db.from('report_dispatches').insert({org_id:orgId,start_date:start,end_date:end,recipient:to,report_hash:digest,actor:actorId});
  if(logged.error) return NextResponse.json({ok:true,warning:'Correo aceptado, pero no se pudo registrar el envío.',mailId:message.data.id});
  return NextResponse.json({ok:true,mailId:message.data.id,reportHash:digest});
}
