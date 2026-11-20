import { NextRequest, NextResponse } from 'next/server';
import { sendReport } from '@/lib/report';
import { database } from '@/lib/db';
import { timingSafeEqual } from 'node:crypto';
import { previousClosedWeek, localToday } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Scheduled by Vercel on Mondays 12:00 UTC (09:00 in Uruguay).
export async function GET(request: NextRequest) {
  const secret=process.env.CRON_SECRET;
  const authorization=request.headers.get('authorization')||'',supplied=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  if(!secret||!supplied||Buffer.byteLength(secret)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(secret),Buffer.from(supplied)))
    return NextResponse.json({error:'No autorizado'},{status:401});
  if(!process.env.REPORT_ORG_ID) return NextResponse.json({error:'Falta REPORT_ORG_ID'},{status:503});
  const today=localToday();
  if(new Date(`${today}T12:00:00Z`).getUTCDay()!==1)
    return NextResponse.json({skipped:true,reason:'Cierre semanal solo los lunes'});
  const period=previousClosedWeek();
  try {
    const member=await database().query('SELECT id FROM organizations WHERE id=$1',[process.env.REPORT_ORG_ID]);
    if(!member.rowCount)return NextResponse.json({error:'Organización no encontrada'},{status:503});
    return NextResponse.json(await sendReport(process.env.REPORT_ORG_ID,period.start,period.end,{kind:'automatic',source:'cron',actor:null}));
  } catch { return NextResponse.json({error:'No se pudo completar el informe semanal.'},{status:503}); }
}
