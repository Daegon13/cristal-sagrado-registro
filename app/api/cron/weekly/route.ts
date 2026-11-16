import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/reports/send/route';
import { previousClosedWeek, localToday } from '@/lib/time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Scheduled by Vercel on Mondays 12:00 UTC (09:00 in Uruguay).
export async function GET(request: NextRequest) {
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)
    return NextResponse.json({error:'No autorizado'},{status:401});
  if(!process.env.REPORT_ORG_ID) return NextResponse.json({error:'Falta REPORT_ORG_ID'},{status:503});
  const today=localToday();
  if(new Date(`${today}T12:00:00Z`).getUTCDay()!==1)
    return NextResponse.json({skipped:true,reason:'Cierre semanal solo los lunes'});
  const period=previousClosedWeek();
  const internal=new NextRequest(new URL('/api/reports/send',request.url),{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},
    body:JSON.stringify({orgId:process.env.REPORT_ORG_ID,...period}),
  });
  return POST(internal);
}
