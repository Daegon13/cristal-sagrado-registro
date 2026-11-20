import { createHash } from 'node:crypto';

export type ReportMode =
 | {kind:'automatic';source:'manual'|'cron';actor:string|null}
 | {kind:'reissue';source:'manual';role:'admin'|'operator';actor:string;reason:string;expectedDispatchId:string;requestKey:string};

export type ReportRequest={orgId:string;start:string;end:string;recipient:string;mode:ReportMode};
export type ReportData={metrics:Record<string,number>;[key:string]:unknown};
type Result={rows:Record<string,unknown>[];rowCount:number|null};
export type ReportDb={
 query(sql:string,params?:unknown[]):Promise<Result>;
 connect():Promise<{query(sql:string,params?:unknown[]):Promise<Result>;release():void}>;
};
type Dispatch={id:string;status:'pending'|'sent'|'failed';revision:number;dispatched_at:string|null;actor:string|null;reissue_reason:string|null;supersedes_id:string|null;request_key:string|null};

export class ReportDispatchError extends Error {
 code:'PENDING'|'FAILED_REVIEW'|'NOT_EMITTED'|'STALE'|'BAD_REISSUE'|'PROVIDER_REJECTED'|'AMBIGUOUS';
 constructor(code:ReportDispatchError['code'],message:string){super(message);this.code=code}
}
export class ProviderRejectedError extends Error {}

export function versionedReport(data:ReportData,revision:number,supersedesId:string|null){
 const finalData={...data,dispatch:{type:'financial',revision,supersedesId}};
 const payload=JSON.stringify(finalData);
 return {data:finalData,payload,digest:createHash('sha256').update(payload).digest('hex'),revision};
}

export function metricDifferences(previous:ReportData|null,current:ReportData){
 if(!previous)return null;
 const keys=['inquiries','newSales','grossPayments','refunds','netReceived','expenses','advertisingSpend','recordedCashDifference'];
 return keys.map(key=>({key,before:Number(previous.metrics?.[key]??0),now:Number(current.metrics?.[key]??0),change:Number(current.metrics?.[key]??0)-Number(previous.metrics?.[key]??0)}));
}

const latestSql=`SELECT id,status,revision,dispatched_at,actor,reissue_reason,supersedes_id,request_key,report_hash,report_snapshot
 FROM report_dispatches WHERE org_id=$1 AND start_date=$2::date AND end_date=$3::date AND report_type='financial'
 ORDER BY revision DESC LIMIT 1`;
export async function latestReport(db:ReportDb,orgId:string,start:string,end:string){
 const result=await db.query(latestSql,[orgId,start,end]);return result.rows[0]||null;
}
export async function reportHistory(db:ReportDb,orgId:string,start:string,end:string){
 const result=await db.query(`SELECT id,revision,status,dispatch_kind,trigger_source,supersedes_id,reissue_reason,dispatched_at
  FROM report_dispatches WHERE org_id=$1 AND start_date=$2::date AND end_date=$3::date AND report_type='financial' ORDER BY revision DESC LIMIT 20`,[orgId,start,end]);
 return result.rows;
}

async function reserveReport(db:ReportDb,request:ReportRequest,data:ReportData){
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  const {orgId,start,end,recipient,mode}=request;
  let previous:Dispatch|null=null,revision=1;
  if(mode.kind==='automatic'){
   const claim=await client.query("INSERT INTO report_period_claims(org_id,start_date,end_date,report_type) VALUES($1,$2::date,$3::date,'financial') ON CONFLICT DO NOTHING RETURNING org_id",[orgId,start,end]);
   if(!claim.rowCount){
    const existing=await client.query(latestSql,[orgId,start,end]);
    await client.query('COMMIT');
    if(!existing.rows[0])throw new ReportDispatchError('PENDING','El período está reservado y requiere revisión.');
    return {existing:existing.rows[0] as unknown as Dispatch,created:null};
   }
  }else{
   const reason=mode.reason.trim();
   if(mode.role!=='admin'||!mode.actor||reason.length<10||reason.length>240||!mode.expectedDispatchId||!mode.requestKey)throw new ReportDispatchError('BAD_REISSUE','La reemisión necesita administrador, motivo y confirmación explícita.');
   const claim=await client.query("SELECT org_id FROM report_period_claims WHERE org_id=$1 AND start_date=$2::date AND end_date=$3::date AND report_type='financial' FOR UPDATE",[orgId,start,end]);
   if(!claim.rowCount)throw new ReportDispatchError('NOT_EMITTED','Todavía no existe un informe de este período.');
   const retry=await client.query('SELECT id,status,revision,dispatched_at,actor,reissue_reason,supersedes_id,request_key FROM report_dispatches WHERE request_key=$1',[mode.requestKey]);
   if(retry.rows[0]){
    const prior=retry.rows[0] as unknown as Dispatch;
    if(prior.actor!==mode.actor||prior.reissue_reason!==reason||prior.supersedes_id!==mode.expectedDispatchId)throw new ReportDispatchError('BAD_REISSUE','La clave de reemisión ya corresponde a otra operación.');
    await client.query('COMMIT');return {existing:prior,created:null};
   }
   const last=await client.query(latestSql,[orgId,start,end]);
   previous=last.rows[0] as unknown as Dispatch||null;
   if(!previous||previous.id!==mode.expectedDispatchId)throw new ReportDispatchError('STALE','El último informe cambió; revisá las diferencias antes de reemitir.');
   if(previous.status==='pending')throw new ReportDispatchError('PENDING','El último informe necesita conciliación antes de una reemisión.');
   revision=Number(previous.revision)+1;
  }
  const version=versionedReport(data,revision,previous?.id||null);
  const inserted=await client.query(`INSERT INTO report_dispatches
   (org_id,start_date,end_date,report_type,revision,dispatch_kind,trigger_source,recipient,report_hash,status,actor,reissue_reason,supersedes_id,request_key,report_snapshot)
   VALUES($1,$2::date,$3::date,'financial',$4,$5,$6,$7,$8,'pending',$9,$10,$11,$12,$13::jsonb) RETURNING id`,
   [orgId,start,end,revision,mode.kind==='reissue'?'reissue':'initial',mode.source,recipient,version.digest,mode.actor,mode.kind==='reissue'?mode.reason.trim():null,previous?.id||null,mode.kind==='reissue'?mode.requestKey:null,JSON.stringify(version.data)]);
  await client.query('COMMIT');
  return {existing:null,created:{id:String(inserted.rows[0].id),...version}};
 }catch(error){try{await client.query('ROLLBACK')}catch{}throw error}finally{client.release()}
}

function existingResult(dispatch:Dispatch){
 if(dispatch.status==='sent')return {ok:true,alreadySent:true,revision:Number(dispatch.revision),at:dispatch.dispatched_at};
 if(dispatch.status==='failed')throw new ReportDispatchError('FAILED_REVIEW','El envío anterior falló; requiere revisión administrativa, no se reintentó.');
 throw new ReportDispatchError('PENDING','El envío está pendiente de conciliación; no se reintentó.');
}

export async function deliverReport(db:ReportDb,request:ReportRequest,build:()=>Promise<ReportData>,send:(report:{id:string;revision:number;data:ReportData;payload:string;digest:string})=>Promise<string>){
 const data=await build();
 const reservation=await reserveReport(db,request,data);
 if(reservation.existing)return existingResult(reservation.existing);
 const created=reservation.created!;
 try{
  const providerId=await send(created);
  await db.query("UPDATE report_dispatches SET status='sent',provider_id=$1,dispatched_at=now() WHERE id=$2 AND status='pending'",[providerId,created.id]);
  return {ok:true,revision:created.revision,reportHash:created.digest};
 }catch(error){
  if(error instanceof ProviderRejectedError){
   await db.query("UPDATE report_dispatches SET status='failed',error_code='PROVIDER_REJECTED' WHERE id=$1 AND status='pending'",[created.id]);
   throw new ReportDispatchError('PROVIDER_REJECTED','El proveedor rechazó el informe; no se reintentó.');
  }
  throw new ReportDispatchError('AMBIGUOUS','Resultado de envío incierto; quedó pendiente de conciliación y no se reintentará automáticamente.');
 }
}
