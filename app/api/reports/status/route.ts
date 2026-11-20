import { access, respondError } from '@/lib/access';
import { isValidCalendarDate, localToday } from '@/lib/time';
import { getReportStatus } from '@/lib/report';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const url=new URL(request.url),orgId=url.searchParams.get('orgId')||undefined,start=url.searchParams.get('start'),end=url.searchParams.get('end');
  const ctx=await access(orgId);
  if(!isValidCalendarDate(start)||!isValidCalendarDate(end)||end<start||end>localToday()||(Date.parse(end)-Date.parse(start))/86400000>35)return Response.json({error:'Fechas inválidas.'},{status:400});
  const result=await getReportStatus(ctx.org_id,start,end);
  return Response.json({...result,history:ctx.role==='admin'?result.history:result.history.map(({reissue_reason:unused,...entry})=>entry),canReissue:ctx.role==='admin'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return respondError(error)}
}
