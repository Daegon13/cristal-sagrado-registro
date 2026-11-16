import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'cristal-sagrado-registro', configured: Boolean(process.env.DATABASE_URL && process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET) }, { headers: { 'Cache-Control': 'no-store' } });
}
