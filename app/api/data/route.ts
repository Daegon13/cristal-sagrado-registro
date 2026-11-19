import { database } from '@/lib/db';
import { access, AccessError, respondError } from '@/lib/access';
import { isValidCalendarDate } from '@/lib/time';
import { SOURCES, METHODS, SERVICES } from '@/lib/types';
import { sameOrigin } from '@/lib/http';
import { fold, normalizeHandle } from '@/lib/contact-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const tables = ['contacts','inquiries','sales','payments','expenses','ad_campaigns','ad_spend_entries','audit_log'] as const;
type Table = typeof tables[number];
const uuid = (v:unknown):v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text = (v:unknown, max:number) => typeof v==='string' ? v.trim().slice(0,max) : '';
const money = (v:unknown) => typeof v==='number' || typeof v==='string' ? /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(v)) && Number(v)>0 : false;
const dateString=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const source = (v:unknown) => SOURCES.some(s=>s.value===v);
const method = (v:unknown) => METHODS.some(m=>m.value===v);
const order:Record<Table,string>={contacts:'created_at',inquiries:'created_at',sales:'created_at',payments:'received_at',expenses:'created_at',ad_campaigns:'created_at',ad_spend_entries:'created_at',audit_log:'id'};
const fail=(message:string,status:number)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});

export async function GET(request:Request) {
  try {
    const url=new URL(request.url), table=url.searchParams.get('table') as Table;
    if(url.searchParams.get('table')==='contact_search'){
      const ctx=await access(url.searchParams.get('orgId')||undefined);
      const q=fold((url.searchParams.get('q')||'').slice(0,100));
      // Keep this bounded even when the organization has thousands of contacts.
      const result=await database().query(`SELECT c.id,c.alias,c.display_name,c.instagram_handle,c.handle_confirmed,c.source,c.created_at,
        count(DISTINCT i.id)::int AS inquiry_count,count(DISTINCT s.id)::int AS sale_count,
        COALESCE(bool_or(p.kind='payment' AND p.voided_at IS NULL),false) AS has_payment
        FROM contacts c LEFT JOIN inquiries i ON i.org_id=c.org_id AND i.contact_id=c.id
        LEFT JOIN sales s ON s.org_id=c.org_id AND s.contact_id=c.id
        LEFT JOIN payments p ON p.org_id=c.org_id AND p.sale_id=s.id
        WHERE c.org_id=$1 AND c.merged_into IS NULL AND
        ($2='' OR lower(translate(c.alias,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) LIKE '%'||$2||'%' OR
         lower(translate(COALESCE(c.display_name,''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) LIKE '%'||$2||'%' OR
         c.instagram_handle LIKE '%'||$2||'%' OR left(c.id::text,8)=$2)
        GROUP BY c.id ORDER BY
        CASE WHEN $2<>'' AND c.instagram_handle=$2 THEN 0 WHEN $2<>'' AND lower(translate(c.alias,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) LIKE $2||'%' THEN 1 ELSE 2 END,
        c.created_at DESC LIMIT 10`,[ctx.org_id,q]);
      return Response.json({rows:result.rows},{headers:{'Cache-Control':'no-store'}});
    }
    if (!tables.includes(table)) return fail('Tabla inválida.',400);
    const page=Number(url.searchParams.get('page')||0);
    if (!Number.isSafeInteger(page)||page<0||page>100000) return fail('Página inválida.',400);
    const ctx=await access(url.searchParams.get('orgId')||undefined);
    const limit=table==='audit_log'?100:200;
    const dates=table==='ad_campaigns'||table==='ad_spend_entries'?',starts_on::text AS starts_on,ends_on::text AS ends_on':table==='expenses'?',occurred_on::text AS occurred_on':'';
    const result=await database().query(`SELECT *${dates} FROM ${table} WHERE org_id=$1 ORDER BY ${order[table]} DESC,id DESC LIMIT $2 OFFSET $3`,[ctx.org_id,limit+1,page*limit]);
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
      const handle=body.instagramHandle?normalizeHandle(String(body.instagramHandle)):null;
      if(body.instagramHandle && !handle)return fail('Usuario de Instagram inválido.',400);
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
        } else if(text(body.alias,100)||handle){
          const alias=text(body.alias,100)||`@${handle}`;
          const created=await client.query('INSERT INTO contacts(org_id,alias,instagram_handle,source,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[ctx.org_id,alias,handle,body.source,ctx.userId]);
          contactId=created.rows[0].id;
        }
        const saved=await client.query('INSERT INTO inquiries(org_id,contact_id,source,created_by,idempotency_key) VALUES($1,$2,$3,$4,$5) RETURNING id',[ctx.org_id,contactId,body.source,ctx.userId,body.key]);
        await client.query('COMMIT'); return Response.json({id:saved.rows[0].id,contactId});
      } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }
    if(action==='contactAlias') {
      if(!uuid(body.id)||text(body.alias,100).length<1) return fail('Alias inválido.',400);
      const client=await db.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('app.actor_id',$1,true)",[ctx.userId]);
       const result=await client.query('UPDATE contacts SET alias=$1 WHERE org_id=$2 AND id=$3 RETURNING id',[text(body.alias,100),ctx.org_id,body.id]);
       await client.query('COMMIT');if(!result.rowCount) return fail('Cliente inexistente.',404);return Response.json({id:result.rows[0].id});
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release()}
    }
    if(action==='contactIdentity') {
      if(!uuid(body.id)||!text(body.alias,100))return fail('Cliente inválido.',400);
      const handle=body.instagramHandle?normalizeHandle(String(body.instagramHandle)):null;
      if(body.instagramHandle&&!handle)return fail('Usuario de Instagram inválido.',400);
      if(body.confirmed===true&&!handle)return fail('Confirmá un usuario de Instagram válido.',400);
      const client=await db.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('app.actor_id',$1,true)",[ctx.userId]);
        const result=await client.query('UPDATE contacts SET alias=$1,display_name=$2,instagram_handle=$3,handle_confirmed=$4 WHERE org_id=$5 AND id=$6 AND merged_into IS NULL RETURNING id',[text(body.alias,100),text(body.displayName,100)||null,handle,body.confirmed===true,ctx.org_id,body.id]);
        if(!result.rowCount)throw new AccessError(404,'Cliente inexistente.');
        await client.query('COMMIT');return Response.json({id:result.rows[0].id});
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    }
    if(action==='linkInquiry') {
      if(!uuid(body.inquiryId)||!uuid(body.contactId))return fail('Vínculo inválido.',400);
      const result=await db.query('UPDATE inquiries SET contact_id=$1 WHERE org_id=$2 AND id=$3 AND contact_id IS NULL AND EXISTS (SELECT 1 FROM contacts WHERE org_id=$2 AND id=$1 AND merged_into IS NULL) RETURNING id',[body.contactId,ctx.org_id,body.inquiryId]);
      if(!result.rowCount)return fail('La consulta ya está vinculada o no existe.',409);
      return Response.json({id:result.rows[0].id});
    }
    if(action==='sale') {
      if(!uuid(body.key)||!SERVICES.includes(String(body.service))||!money(body.amount)||
         (body.contactId!=null&&!uuid(body.contactId))||(body.inquiryId!=null&&!uuid(body.inquiryId))||(!body.contactId&&!body.inquiryId))return fail('Venta inválida.',400);
      const client=await db.connect();try{
        await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[body.key]);
        const prior=await client.query('SELECT * FROM sales WHERE idempotency_key=$1',[body.key]);
        if(prior.rows[0]){
          const p=prior.rows[0];if(p.org_id!==ctx.org_id||p.created_by!==ctx.userId||p.service!==body.service||Number(p.agreed_amount)!==Number(body.amount)||p.inquiry_id!==(body.inquiryId||null)||(body.contactId&&p.contact_id!==body.contactId))throw new AccessError(409,'Clave de operación ya usada.');
          await client.query('COMMIT');return Response.json({id:p.id,contactId:p.contact_id,replayed:true});
        }
        let contactId=body.contactId as string|undefined;
        if(body.inquiryId){
          const inquiry=await client.query('SELECT contact_id,source FROM inquiries WHERE org_id=$1 AND id=$2 FOR UPDATE',[ctx.org_id,body.inquiryId]);
          if(!inquiry.rowCount)throw new AccessError(404,'Consulta inexistente.');
          const existing=inquiry.rows[0].contact_id as string|null;
          if(existing&&contactId&&existing!==contactId)throw new AccessError(409,'La consulta pertenece a otro cliente.');
          contactId=existing||contactId;
          if(!contactId){
            const created=await client.query('INSERT INTO contacts(org_id,alias,source,created_by) VALUES($1,$2,$3,$4) RETURNING id',[ctx.org_id,`Cliente #${String(body.inquiryId).slice(0,8)}`,inquiry.rows[0].source,ctx.userId]);
            contactId=created.rows[0].id;
          }
          if(!existing)await client.query('UPDATE inquiries SET contact_id=$1 WHERE org_id=$2 AND id=$3',[contactId,ctx.org_id,body.inquiryId]);
        }
        const result=await client.query('INSERT INTO sales(org_id,contact_id,inquiry_id,service,agreed_amount,created_by,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[ctx.org_id,contactId,body.inquiryId||null,body.service,body.amount,ctx.userId,body.key]);
        await client.query('COMMIT');return Response.json({id:result.rows[0].id,contactId});
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    }
    if(action==='mergeContacts') {
      if(!uuid(body.fromId)||!uuid(body.intoId)||body.fromId===body.intoId||body.confirm!==true)return fail('Fusión inválida.',400);
      const client=await db.connect();try{
        await client.query('BEGIN');await client.query("SELECT set_config('app.actor_id',$1,true)",[ctx.userId]);
        const pair=await client.query('SELECT id,instagram_handle,handle_confirmed,merged_into FROM contacts WHERE org_id=$1 AND id IN ($2,$3) ORDER BY id FOR UPDATE',[ctx.org_id,body.fromId,body.intoId]);
        if(pair.rowCount!==2||pair.rows.some(x=>x.merged_into))throw new AccessError(404,'Clientes inexistentes o fusionados.');
        const from=pair.rows.find(x=>x.id===body.fromId),into=pair.rows.find(x=>x.id===body.intoId);
        if(from.handle_confirmed&&into.handle_confirmed&&from.instagram_handle!==into.instagram_handle)throw new AccessError(409,'Los usuarios confirmados son distintos. Revisá la identidad.');
        await client.query('UPDATE inquiries SET contact_id=$1 WHERE org_id=$2 AND contact_id=$3',[body.intoId,ctx.org_id,body.fromId]);
        await client.query('UPDATE sales SET contact_id=$1 WHERE org_id=$2 AND contact_id=$3',[body.intoId,ctx.org_id,body.fromId]);
        if(from.handle_confirmed&&!into.handle_confirmed){
          await client.query('UPDATE contacts SET handle_confirmed=false WHERE org_id=$1 AND id=$2',[ctx.org_id,body.fromId]);
          await client.query('UPDATE contacts SET instagram_handle=$1,handle_confirmed=true WHERE org_id=$2 AND id=$3',[from.instagram_handle,ctx.org_id,body.intoId]);
        }
        await client.query('UPDATE contacts SET merged_into=$1 WHERE org_id=$2 AND id=$3',[body.intoId,ctx.org_id,body.fromId]);
        await client.query('COMMIT');return Response.json({id:body.intoId});
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    }
    if(action==='adCampaign') {
      if(!text(body.name,120)||!isValidCalendarDate(body.startsOn)||!isValidCalendarDate(body.endsOn)||body.endsOn<body.startsOn||!['daily','total'].includes(String(body.budgetKind))||!money(body.budgetAmount))return fail('Campaña inválida.',400);
      const result=await db.query('INSERT INTO ad_campaigns(org_id,name,starts_on,ends_on,budget_kind,budget_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[ctx.org_id,text(body.name,120),body.startsOn,body.endsOn,body.budgetKind,body.budgetAmount,ctx.userId]);
      return Response.json({id:result.rows[0].id});
    }
    if(action==='adSpend') {
      if(!uuid(body.key)||!money(body.amount)||!isValidCalendarDate(body.startsOn)||!isValidCalendarDate(body.endsOn)||body.endsOn<body.startsOn||
         (body.campaignId!=null&&!uuid(body.campaignId)))return fail('Gasto publicitario inválido.',400);
      const client=await db.connect();try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${ctx.org_id}/ads/${body.campaignId||'none'}`]);
        const prior=await client.query('SELECT * FROM ad_spend_entries WHERE idempotency_key=$1',[body.key]);
        if(prior.rows[0]){
          const p=prior.rows[0];if(p.org_id!==ctx.org_id||p.created_by!==ctx.userId||p.campaign_id!==(body.campaignId||null)||Number(p.amount)!==Number(body.amount)||dateString(p.starts_on)!==body.startsOn||dateString(p.ends_on)!==body.endsOn)throw new AccessError(409,'Clave de operación ya usada.');
          await client.query('COMMIT');return Response.json({id:p.id,replayed:true});
        }
        if(body.campaignId){const campaign=await client.query('SELECT starts_on,ends_on FROM ad_campaigns WHERE org_id=$1 AND id=$2',[ctx.org_id,body.campaignId]);
          if(!campaign.rowCount)throw new AccessError(404,'Campaña inexistente.');
          const c=campaign.rows[0];if(dateString(c.starts_on)>body.startsOn||dateString(c.ends_on)<body.endsOn)throw new AccessError(400,'El gasto debe quedar dentro de la campaña.');
        }
        const overlap=await client.query('SELECT id FROM ad_spend_entries WHERE org_id=$1 AND campaign_id IS NOT DISTINCT FROM $2::uuid AND voided_at IS NULL AND starts_on <= $3::date AND ends_on >= $4::date LIMIT 1',[ctx.org_id,body.campaignId||null,body.endsOn,body.startsOn]);
        if(overlap.rowCount)throw new AccessError(409,'Ya existe gasto de esa campaña en un período superpuesto. Revisá antes de cargarlo.');
        const legacy=await client.query("SELECT id FROM expenses WHERE org_id=$1 AND category='ads' AND voided_at IS NULL AND occurred_on BETWEEN $2::date AND $3::date LIMIT 1",[ctx.org_id,body.startsOn,body.endsOn]);
        if(legacy.rowCount)throw new AccessError(409,'Hay publicidad cargada en Gastos para ese período. Conciliá o anulá ese asiento antes de registrar el gasto de Meta.');
        const saved=await client.query('INSERT INTO ad_spend_entries(org_id,campaign_id,starts_on,ends_on,amount,note,idempotency_key,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[ctx.org_id,body.campaignId||null,body.startsOn,body.endsOn,body.amount,text(body.note,1000)||null,body.key,ctx.userId]);
        await client.query('COMMIT');return Response.json({id:saved.rows[0].id});
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    }
    if(action==='payment'||action==='expense') {
      if(!uuid(body.key)||!money(body.amount)) return fail('Importe o clave inválidos.',400);
      if(action==='payment'&&(!uuid(body.saleId)||!method(body.method)||!['payment','refund'].includes(String(body.kind)))) return fail('Cobro inválido.',400);
      if(action==='expense'&&(!['materials','fees','other'].includes(String(body.category))||!isValidCalendarDate(body.occurredOn))) return fail('Para publicidad usá gasto por período.',400);
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
        (action==='payment' ? p.sale_id===body.saleId&&p.method===body.method&&p.kind===body.kind : p.category===body.category&&
          (p.occurred_on instanceof Date?p.occurred_on.toISOString().slice(0,10):String(p.occurred_on).slice(0,10))===body.occurredOn&&
          p.note===(text(body.note,1000)||null));
      if(!match) return fail('Clave de operación ya usada con otros datos.',409);
      return Response.json({id:p.id,replayed:true});
    }
    if(action==='void') {
      if(!['payments','expenses','ad_spend_entries'].includes(String(body.table))||!uuid(body.id)||text(body.reason,240).length<6) return fail('Anulación inválida.',400);
      const table=body.table as 'payments'|'expenses'|'ad_spend_entries';
      const result=await db.query(`UPDATE ${table} SET voided_at=now(),voided_by=$1,void_reason=$2 WHERE org_id=$3 AND id=$4 AND voided_at IS NULL RETURNING id`,[ctx.userId,text(body.reason,240),ctx.org_id,body.id]);
      if(!result.rowCount) return fail('Registro inexistente o ya anulado.',404);
      return Response.json({id:result.rows[0].id});
    }
    return fail('Operación inválida.',400);
  } catch(e) {
    if(e instanceof SyntaxError) return fail('JSON inválido.',400);
    if(typeof e==='object'&&e&&'code' in e&&e.code==='23505')return fail('Ya existe un cliente con ese Instagram confirmado o una operación duplicada.',409);
    if(typeof e==='object'&&e&&'code' in e&&['23503','23514','22P02','22003'].includes(String(e.code))) return fail('Datos inválidos o de otra organización.',400);
    if(typeof e==='object'&&e&&'code' in e&&e.code==='P0001'&&'message' in e&&
      ['Refund exceeds received amount','Sale unavailable','Void would leave refunds above received amount'].includes(String(e.message)))
      return fail('El movimiento no respeta el saldo de la venta.',400);
    return respondError(e);
  }
}
