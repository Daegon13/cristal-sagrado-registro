import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'cristal-sagrado-registro', configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) }, { headers: { 'Cache-Control': 'no-store' } });
}
