import { auth } from '@/lib/auth/server';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
const handlers = auth.handler();
const ready=()=>Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET && process.env.DATABASE_URL);
const unavailable=()=>NextResponse.json({error:'Configuración pendiente'},{status:503});
export async function GET(request:NextRequest, context:Parameters<typeof handlers.GET>[1]){return ready()?handlers.GET(request,context):unavailable()}
export async function PUT(request:NextRequest, context:Parameters<typeof handlers.PUT>[1]){return ready()?handlers.PUT(request,context):unavailable()}
export async function PATCH(request:NextRequest, context:Parameters<typeof handlers.PATCH>[1]){return ready()?handlers.PATCH(request,context):unavailable()}
export async function DELETE(request:NextRequest, context:Parameters<typeof handlers.DELETE>[1]){return ready()?handlers.DELETE(request,context):unavailable()}
export async function POST(request: NextRequest, context: Parameters<typeof handlers.POST>[1]) {
  if (!ready()) return unavailable();
  if (/\/sign-up(?:\/|$)/.test(request.nextUrl.pathname)) return NextResponse.json({ error: 'Registro público deshabilitado' }, { status: 403 });
  return handlers.POST(request, context);
}
