import { access, respondError } from '@/lib/access';
export const dynamic='force-dynamic';
export async function GET(){try{const ctx=await access();return Response.json({orgId:ctx.org_id,role:ctx.role},{headers:{'Cache-Control':'no-store'}})}catch(e){return respondError(e)}}
