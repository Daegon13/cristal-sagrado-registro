import { access, respondError } from '@/lib/access';
import { isValidCalendarDate, localToday } from '@/lib/time';
import { sendReport } from '@/lib/report';
import { sameOrigin } from '@/lib/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{if(!sameOrigin(request))return Response.json({error:'Origen no autorizado.'},{status:403});const body=await request.json() as {orgId?:string;start?:string;end?:string};
  const ctx=await access(body.orgId);
  if(!isValidCalendarDate(body.start)||!isValidCalendarDate(body.end)||body.end<body.start||body.end>localToday()||(Date.parse(body.end)-Date.parse(body.start))/86400000>35)return Response.json({error:'Fechas inválidas.'},{status:400});
  return Response.json(await sendReport(ctx.org_id,body.start,body.end,ctx.userId));
 }catch(e){if(e instanceof Error&&e.message==='REPORT_PENDING')return Response.json({error:'El envío está pendiente de revisión; no se reintentó.'},{status:409});return respondError(e)}
}
