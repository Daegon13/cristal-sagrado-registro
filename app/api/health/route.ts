import { NextResponse } from 'next/server';
import { isTrialEnvironmentConfigured } from '@/lib/experiment-env';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'cristal-sagrado-registro', configured: isTrialEnvironmentConfigured(process.env) }, { headers: { 'Cache-Control': 'no-store' } });
}
