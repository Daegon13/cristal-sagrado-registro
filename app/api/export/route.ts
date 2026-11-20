import { access, respondError } from '@/lib/access';
import { database } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const names=['organizations','memberships','contacts','inquiries','sales','payments','expenses','ad_campaigns','ad_spend_entries','report_period_claims','audit_log','report_dispatches'] as const;
const csvCell=(value:unknown)=>`"${String(value??'').replace(/"/g,'""').replace(/^[=+@\-\t\r]/,"'$&")}"`;
export async function GET(request:Request){
 try{
  const url=new URL(request.url),ctx=await access(url.searchParams.get('orgId')||undefined),format=url.searchParams.get('format');
  if(format!=='json'&&format!=='csv') return Response.json({error:'Formato inválido.'},{status:400});
  const client=await database().connect();
  try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const data:Record<string,unknown[]>={};
   for(const table of names){const rows:unknown[]=[];for(let page=0;;page++){
    const order=table==='memberships'?'user_id':table==='report_period_claims'?'start_date,end_date,report_type':'id';
    const batch=await client.query(`SELECT * FROM ${table} WHERE ${table==='organizations'?'id':'org_id'}=$1 ORDER BY ${order} LIMIT 500 OFFSET $2`,[ctx.org_id,page*500]);
    rows.push(...batch.rows);if(batch.rows.length<500)break;
   }data[table]=rows;}
   await client.query('COMMIT');
   const filename=`cs-registro-${new Date().toISOString().slice(0,10)}.${format}`;
   if(format==='json')return new Response(JSON.stringify({schema:'cristal-sagrado-backup/v2',exportedAt:new Date().toISOString(),orgId:ctx.org_id,data}),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'}});
   const rows=['table,id,date,kind,amount,reference'];
   for(const table of ['payments','expenses','ad_spend_entries'] as const)for(const item of data[table] as Record<string,unknown>[]){
    rows.push([table,item.id,item.received_at||item.occurred_on||`${item.starts_on} a ${item.ends_on}`,item.kind||item.category||'meta_ads_manager',item.amount,item.sale_id||item.campaign_id||''].map(csvCell).join(','));
   }
   return new Response(rows.join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'}});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }catch(e){return respondError(e)}
}
