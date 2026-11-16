import { database } from '@/lib/db';
import { access, AccessError, respondError } from '@/lib/access';
import { isValidCalendarDate } from '@/lib/time';
import { SOURCES, METHODS, SERVICES } from '@/lib/types';
import { sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const tables = ['contacts','inquiries','sales','payments','expenses','audit_log'] as const;
type Table = typeof tables[number];
const uuid = (v:unknown):v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text = (v:unknown, max:number) => typeof v==='string' ? v.trim().slice(0,max) : '';
const money = (v:unknown) => typeof v==='number' || typeof v==='string' ? /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(v)) && Number(v)>0 : false;
const source = (v:unknown) => SOURCES.some(s=>s.value===v);
const method = (v:unknown) => METHODS.some(m=>m.value===v);
const order:Record<Table,string>={contacts:'created_at',inquiries:'created_at',sales:'created_at',payments:'received_at',expenses:'created_at',audit_log:'id'};
const fail=(message:string,status:number)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});

export async function GET(request:Request) {
  try {
    const url=new URL(request.url), table=url.searchParams.get('table') as Table;
    if (!tables.includes(table)) return fail('Tabla inválida.',400);
    const page=Number(url.searchParams.get('page')||0);
    if (!Number.isSafeInteger(page)||page<0||page>100000) return fail('Página inválida.',400);
    const ctx=await access(url.searchParams.get('orgId')||undefined);
    const limit=table==='audit_log'?100:200;
    const result=await database().query(`SELECT * FROM ${table} WHERE org_id=$1 ORDER BY ${order[table]} DESC,id DESC LIMIT $2 OFFSET $3`,[ctx.org_id,limit+1,page*limit]);
    return Response.json({rows:result.rows.slice(0,limit),hasMore:result.rows.length>limit,orgId:ctx.org_id},{headers:{'Cache-Control':'no-store'}});
  } catch(e) { return respondError(e); }
}

export async function POST(request:Request) {
  try {
    if(!sameOrigin(request))return fail('Origen no autorizado.',403);
    const body=await request.json() as Record<string,unknown>;
    if (!body || typeof body!=='object') return fail('Solicitud inválida.',400);
    const ctx=await access(typeof body.orgId==='string'?body.orgId:undefined);
    const db=database();
    const action=body.action;
    if (action==='inquiry') {
      if (!uuid(body.key)||!source(body.source)|| (body.contactId!=null&&!uuid(body.contactId))) return fail('Consulta inválida.',400);
      const client=await db.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[body.key]);
        const prior=await client.query('SELECT id,org_id,created_by,source,contact_id FROM inquiries WHERE idempotency_key=$1',[body.key]);
        if(prior.rows[0]) {
          const p=prior.rows[0];
          if(p.org_id!==ctx.org_id||p.created_by!==ctx.userId||p.source!==body.source||((body.contactId||null)!==null && p.contact_id!==body.contactId)) throw new AccessError(409,'Clave de operación ya usada.');
          await client.query('COMMIT'); return Response.json({id:p.id,replayed:true});
        }
        let contactId=body.contactId as string|null;
        if (contactId) {
          const found=await client.query('SELECT id FROM contacts WHERE org_id=$1 AND id=$2',[ctx.org_id,contactId]);
          if(!found.rowCount) throw new AccessError(404,'Cliente inexistente.');
        } else {
          const alias=text(body.alias,100)||`Consulta ${new Date().toLocaleString('es-UY',{timeZone:'America/Montevideo'})}`;
          const created=await client.query('INSERT INTO contacts(org_id,alias,source,created_by) VALUES($1,$2,$3,$4) RETURNING id',[ctx.org_id,alias,body.source,ctx.userId]);
          contactId=created.rows[0].id;
        }
        const saved=await client.query('INSERT INTO inquiries(org_id,contact_id,source,created_by,idempotency_key) VALUES($1,$2,$3,$4,$5) RETURNING id',[ctx.org_id,contactId,body.source,ctx.userId,body.key]);
        await client.query('COMMIT'); return Response.json({id:saved.rows[0].id});
      } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }
    if(action==='contactAlias') {
      if(!uuid(body.id)||text(body.alias,100).length<1) return fail('Alias inválido.',400);
      const client=await db.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('app.actor_id',$1,true)",[ctx.userId]);
       const result=await client.query('UPDATE contacts SET alias=$1 WHERE org_id=$2 AND id=$3 RETURNING id',[text(body.alias,100),ctx.org_id,body.id]);
       await client.query('COMMIT');if(!result.rowCount) return fail('Cliente inexistente.',404);return Response.json({id:result.rows[0].id});
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release()}
    }
    if(action==='sale') {
      if(!uuid(body.contactId)||!SERVICES.includes(String(body.service))||!money(body.amount)) return fail('Venta inválida.',400);
      const result=await db.query('INSERT INTO sales(org_id,contact_id,service,agreed_amount,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[ctx.org_id,body.contactId,body.service,body.amount,ctx.userId]);
      return Response.json({id:result.rows[0].id});
    }
    if(action==='payment'||action==='expense') {
      if(!uuid(body.key)||!money(body.amount)) return fail('Importe o clave inválidos.',400);
      if(action==='payment'&&(!uuid(body.saleId)||!method(body.method)||!['payment','refund'].includes(String(body.kind)))) return fail('Cobro inválido.',400);
      if(action==='expense'&&(!['ads','materials','fees','other'].includes(String(body.category))||!isValidCalendarDate(body.occurredOn))) return fail('Gasto inválido.',400);
      const values=action==='payment'
        ? [ctx.org_id,body.saleId,body.amount,body.method,body.kind,body.key,ctx.userId]
        : [ctx.org_id,body.amount,body.category,body.occurredOn,text(body.note,1000)||null,body.key,ctx.userId];
      const sql=action==='payment'
        ? 'INSERT INTO payments(org_id,sale_id,amount,method,kind,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id'
        : 'INSERT INTO expenses(org_id,amount,category,occurred_on,note,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id';
      const inserted=await db.query(sql,values);
      if(inserted.rows[0]) return Response.json({id:inserted.rows[0].id});
      const old=await db.query(`SELECT * FROM ${action==='payment'?'payments':'expenses'} WHERE idempotency_key=$1`,[body.key]);
      const p=old.rows[0];
      const match=p&&p.org_id===ctx.org_id&&p.created_by===ctx.userId&&Number(p.amount)===Number(body.amount)&&
        (action==='payment' ? p.sale_id===body.saleId&&p.method===body.method&&p.kind===body.kind : p.category===body.category&&String(p.occurred_on).slice(0,10)===body.occurredOn&&p.note===(text(body.note,1000)||null));
      if(!match) return fail('Clave de operación ya usada con otros datos.',409);
      return Response.json({id:p.id,replayed:true});
    }
    if(action==='void') {
      if(!['payments','expenses'].includes(String(body.table))||!uuid(body.id)||text(body.reason,240).length<6) return fail('Anulación inválida.',400);
      const table=body.table as 'payments'|'expenses';
      const result=await db.query(`UPDATE ${table} SET voided_at=now(),voided_by=$1,void_reason=$2 WHERE org_id=$3 AND id=$4 AND voided_at IS NULL RETURNING id`,[ctx.userId,text(body.reason,240),ctx.org_id,body.id]);
      if(!result.rowCount) return fail('Registro inexistente o ya anulado.',404);
      return Response.json({id:result.rows[0].id});
    }
    return fail('Operación inválida.',400);
  } catch(e) {
    if(e instanceof SyntaxError) return fail('JSON inválido.',400);
    if(typeof e==='object'&&e&&'code' in e&&['23503','23514','22P02','22003'].includes(String(e.code))) return fail('Datos inválidos o de otra organización.',400);
    return respondError(e);
  }
}
