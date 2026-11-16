import 'server-only';
import { auth } from '@/lib/auth/server';
import { database } from '@/lib/db';

export class AccessError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function access(orgId?: string) {
  if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET) throw new AccessError(503, 'Configuración pendiente.');
  const { data: session } = await auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new AccessError(401, 'Iniciá sesión.');
  const member = await database().query<{org_id:string;role:'admin'|'operator'}>(
    'SELECT org_id,role FROM memberships WHERE user_id=$1 AND ($2::uuid IS NULL OR org_id=$2::uuid) ORDER BY org_id LIMIT 1',
    [userId, orgId || null]);
  if (!member.rows[0]) throw new AccessError(403, 'No tenés acceso a esta organización.');
  return { userId, ...member.rows[0] };
}
export function respondError(error: unknown) {
  const status = error instanceof AccessError ? error.status : 500;
  const message = error instanceof AccessError ? error.message : 'No se pudo completar la operación.';
  return Response.json({ error: message }, { status, headers: { 'Cache-Control':'no-store' } });
}
