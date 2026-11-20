import { access, respondError } from '@/lib/access';
import { isValidCalendarDate, localToday } from '@/lib/time';
import { sendReport } from '@/lib/report';
import { ReportDispatchError } from '@/lib/report-delivery';
import { sameOrigin } from '@/lib/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{if(!sameOrigin(request))return Response.json({error:'Origen no autorizado.'},{status:403});const body=await request.json() as {orgId?:string;start?:string;end?:string;mode?:string;reason?:string;expectedDispatchId?:string;requestKey?:string;confirm?:boolean};
  const ctx=await access(body.orgId);
  if(!isValidCalendarDate(body.start)||!isValidCalendarDate(body.end)||body.end<body.start||body.end>localToday()||(Date.parse(body.end)-Date.parse(body.start))/86400000>35)return Response.json({error:'Fechas inválidas.'},{status:400});
  if(body.mode==='reissue'){
   if(ctx.role!=='admin')return Response.json({error:'Solo un administrador puede reemitir informes.'},{status:403});
   if(body.confirm!==true||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.trim().length>240||!body.expectedDispatchId||!body.requestKey||![body.expectedDispatchId,body.requestKey].every(x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)))return Response.json({error:'Confirmá la reemisión con motivo y última versión.'},{status:400});
   return Response.json(await sendReport(ctx.org_id,body.start,body.end,{kind:'reissue',source:'manual',role:ctx.role,actor:ctx.userId,reason:body.reason,expectedDispatchId:body.expectedDispatchId,requestKey:body.requestKey}));
  }
  if(body.mode&&body.mode!=='initial')return Response.json({error:'Modo de informe inválido.'},{status:400});
  return Response.json(await sendReport(ctx.org_id,body.start,body.end,{kind:'automatic',source:'manual',actor:ctx.userId}));
 }catch(e){if(e instanceof ReportDispatchError)return Response.json({error:e.message,code:e.code},{status:e.code==='BAD_REISSUE'?400:e.code==='PROVIDER_REJECTED'?502:e.code==='AMBIGUOUS'?503:409});return respondError(e)}
}
