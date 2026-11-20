import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { deliverReport, metricDifferences, ProviderRejectedError, ReportDispatchError, versionedReport, type ReportData, type ReportDb, type ReportRequest } from '../lib/report-delivery.ts';
import { reportEmail } from '../lib/report-email.ts';

async function setup(withLegacy=false){
 const pg=new PGlite();
 for(const number of ['003_neon_initial','004_daily_register'])await pg.exec(await readFile(new URL(`../sql/${number}.sql`,import.meta.url),'utf8'));
 const org=(await pg.query<{id:string}>("INSERT INTO organizations(name) VALUES('QA ficticia') RETURNING id")).rows[0].id;
 if(withLegacy){
  for(const [n,hash] of [1,2].map((n)=>[n,String(n).repeat(64)] as const))await pg.query("INSERT INTO report_dispatches(org_id,start_date,end_date,recipient,report_hash,status,provider_id,dispatched_at,actor) VALUES($1,'2026-11-16','2026-11-19','qa@example.invalid',$2,'sent',$3,now(),'qa-user')",[org,hash,`provider-${n}`]);
 }
 await pg.exec(await readFile(new URL('../sql/005_report_period_idempotency.sql',import.meta.url),'utf8'));
 let queue=Promise.resolve();
 const query=async(sql:string,params:unknown[]=[])=>{const result=await pg.query(sql,params);return {rows:result.rows as Record<string,unknown>[],rowCount:result.rowCount??0}};
 const db:ReportDb={query,connect:async()=>{
  const previous=queue;let release:()=>void=()=>{};queue=new Promise<void>(resolve=>{release=resolve});await previous;
  return {query,release};
 }};
 return {pg,db,org};
}
const data=(inquiries:number,sales:number):ReportData=>({schema:'test/v3',period:{start:'2026-11-16',end:'2026-11-19'},metrics:{inquiries,newSales:sales,grossPayments:12000,refunds:2000,netReceived:10000,expenses:376.5,advertisingSpend:0,recordedCashDifference:9623.5}});
const request=(orgId:string,start:string,end:string,source:'manual'|'cron'):ReportRequest=>({orgId,start,end,recipient:'qa@example.invalid',mode:{kind:'automatic',source,actor:source==='manual'?'qa-user':null}});
const sent=[] as Array<{revision:number;payload:string;digest:string}>;
const sender=async(r:{revision:number;payload:string;digest:string})=>{sent.push(r);return `provider-${sent.length}`};

test('revisión, fechas, hash y metadatos de adjuntos coinciden sin correo real',()=>{
 const report={...data(9,5),metrics:{...data(9,5).metrics,otherExpenses:376.5},integrity:{advertisingPeriodComplete:true,adSpendCrossingPeriodUnallocated:0,partialCampaignBudgetsUnallocated:0,legacyAdvertisingRows:0}};
 const version=versionedReport(report,3,'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
 const {message,idempotencyKey}=reportEmail({from:'qa-from@example.invalid',to:'qa-to@example.invalid',orgId:'11111111-1111-4111-8111-111111111111',start:'2026-11-16',end:'2026-11-19',reissue:true,version,report,rows:{payments:[{amount:'100',method:'cash',kind:'payment',received_at:'2026-11-19',source:'web'}],expenses:[],adSpends:[]}});
 assert.match(message.subject,/2026-11-16 a 2026-11-19 · revisión 3/);
 assert.match(message.text,/Período: 2026-11-16 a 2026-11-19/);
 assert.match(message.text,/Reemisión administrativa/);
 assert.equal(message.attachments.length,4);
 assert.ok(message.attachments.every(x=>x.filename.includes('2026-11-16-2026-11-19-r3')));
 const receivedJson=Buffer.from(message.attachments[0].content,'base64').toString('utf8');
 assert.equal(createHash('sha256').update(receivedJson).digest('hex'),version.digest);
 assert.deepEqual(JSON.parse(receivedJson).dispatch,{type:'financial',revision:3,supersedesId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'});
 assert.match(Buffer.from(message.attachments[1].content,'base64').toString('utf8'),/^amount,method,kind,received_at,client_source/);
 assert.equal(idempotencyKey,'cs-finanzas/11111111-1111-4111-8111-111111111111/financial/2026-11-16/2026-11-19/r3');
});

test('concurrencia manual/cron, cambio de datos y reemisión administrativa controlada',async()=>{
 const {pg,db,org}=await setup();sent.length=0;
 try{
  const period=['2026-11-16','2026-11-19'] as const;
  const [manual,cron]=await Promise.allSettled([
   deliverReport(db,request(org,...period,'manual'),async()=>data(8,4),sender),
   deliverReport(db,request(org,...period,'cron'),async()=>data(8,4),sender)
  ]);
  assert.equal(manual.status,'fulfilled');assert.equal(cron.status,'fulfilled');assert.equal(sent.length,1);
  const first=(await db.query("SELECT id,revision,status,report_snapshot,report_hash FROM report_dispatches WHERE org_id=$1",[org])).rows[0];
  assert.equal(first.revision,1);assert.equal(first.status,'sent');
  assert.equal(createHash('sha256').update(sent[0].payload).digest('hex'),sent[0].digest);
  assert.equal(first.report_hash,sent[0].digest);
  const changed=await deliverReport(db,request(org,...period,'manual'),async()=>data(9,5),sender);
  assert.ok('alreadySent' in changed&&changed.alreadySent);assert.equal(sent.length,1);
  assert.deepEqual(metricDifferences(first.report_snapshot as ReportData,data(9,5))?.filter(x=>x.change!==0).map(x=>[x.key,x.change]),[['inquiries',1],['newSales',1]]);
  const key=randomUUID(),reissueMode={kind:'reissue' as const,source:'manual' as const,role:'admin' as const,actor:'qa-admin',reason:'Corrección QA autorizada',expectedDispatchId:String(first.id),requestKey:key};const reissue:ReportRequest={...request(org,...period,'manual'),mode:reissueMode};
  await assert.rejects(deliverReport(db,{...reissue,mode:{...reissueMode,role:'operator'}},async()=>data(9,5),sender),(e:unknown)=>e instanceof ReportDispatchError&&e.code==='BAD_REISSUE');
  const second=await deliverReport(db,reissue,async()=>data(9,5),sender);
  assert.equal(second.revision,2);assert.equal(sent.length,2);assert.match(sent[1].payload,/"revision":2/);
  const replay=await deliverReport(db,reissue,async()=>data(10,6),sender);
  assert.ok('alreadySent' in replay&&replay.alreadySent);assert.equal(sent.length,2);
  const secondId=String((await db.query('SELECT id FROM report_dispatches WHERE org_id=$1 AND revision=2',[org])).rows[0].id);
  const third=await deliverReport(db,{...reissue,mode:{...reissueMode,expectedDispatchId:secondId,reason:'Reenvío autorizado sin cambios de métricas',requestKey:randomUUID()}},async()=>data(9,5),sender);
  assert.equal(third.revision,3);assert.equal(sent.length,3);assert.notEqual(sent[1].digest,sent[2].digest);
  const history=(await db.query('SELECT revision,dispatch_kind,supersedes_id,reissue_reason,trigger_source,status FROM report_dispatches WHERE org_id=$1 ORDER BY revision',[org])).rows;
  assert.deepEqual(history.map(x=>x.revision),[1,2,3]);assert.equal(history[1].supersedes_id,first.id);assert.equal(history[1].reissue_reason,'Corrección QA autorizada');assert.equal(history[2].supersedes_id,secondId);
  await assert.rejects(deliverReport(db,{...reissue,mode:{...reissueMode,requestKey:randomUUID()}},async()=>data(9,5),sender),(e:unknown)=>e instanceof ReportDispatchError&&e.code==='STALE');
  await assert.rejects(db.query('DELETE FROM report_dispatches WHERE id=$1',[first.id]));
  await assert.rejects(db.query("UPDATE report_dispatches SET report_hash='tampered' WHERE id=$1",[first.id]));
 }finally{await pg.close()}
});

test('reintentos ante resultado ambiguo o rechazo definitivo no llaman al proveedor otra vez',async()=>{
 const {pg,db,org}=await setup();
 try{
  let attempts=0;const ambiguous=request(org,'2026-11-01','2026-11-02','cron');
  await assert.rejects(deliverReport(db,ambiguous,async()=>data(1,1),async()=>{attempts++;throw new Error('network timeout')}),(e:unknown)=>e instanceof ReportDispatchError&&e.code==='AMBIGUOUS');
  await assert.rejects(deliverReport(db,{...ambiguous,mode:{kind:'automatic',source:'manual',actor:'qa-user'}},async()=>data(2,2),async()=>{attempts++;return 'unexpected'}),(e:unknown)=>e instanceof ReportDispatchError&&e.code==='PENDING');
  assert.equal(attempts,1);
  const rejected=request(org,'2026-11-03','2026-11-04','manual');
  await assert.rejects(deliverReport(db,rejected,async()=>data(1,1),async()=>{attempts++;throw new ProviderRejectedError('rejected')}),(e:unknown)=>e instanceof ReportDispatchError&&e.code==='PROVIDER_REJECTED');
  await assert.rejects(deliverReport(db,rejected,async()=>data(2,2),async()=>{attempts++;return 'unexpected'}),(e:unknown)=>e instanceof ReportDispatchError&&e.code==='FAILED_REVIEW');
  assert.equal(attempts,2);
  const states=(await db.query("SELECT status FROM report_dispatches WHERE org_id=$1 ORDER BY start_date",[org])).rows.map(x=>x.status);
  assert.deepEqual(states,['pending','failed']);
  const failedId=String((await db.query("SELECT id FROM report_dispatches WHERE org_id=$1 AND start_date='2026-11-03'",[org])).rows[0].id);
  const recovery:ReportRequest={...rejected,mode:{kind:'reissue',source:'manual',role:'admin',actor:'qa-admin',reason:'Proveedor rechazó el primer intento',expectedDispatchId:failedId,requestKey:randomUUID()}};
  const recovered=await deliverReport(db,recovery,async()=>data(1,1),async()=>{attempts++;return 'provider-recovery'});
  assert.equal(recovered.revision,2);assert.equal(attempts,3);
  assert.ok('alreadySent' in await deliverReport(db,rejected,async()=>data(2,2),async()=>{attempts++;return 'unexpected'}));assert.equal(attempts,3);
 }finally{await pg.close()}
});

test('migración conserva dos envíos históricos y bloquea un tercero automático',async()=>{
 const {pg,db,org}=await setup(true);let attempts=0;
 try{
  const history=(await db.query('SELECT revision,dispatch_kind,status,report_snapshot FROM report_dispatches WHERE org_id=$1 ORDER BY revision',[org])).rows;
  assert.deepEqual(history.map(x=>x.revision),[1,2]);assert.ok(history.every(x=>x.dispatch_kind==='legacy'&&x.status==='sent'&&x.report_snapshot===null));
  const result=await deliverReport(db,request(org,'2026-11-16','2026-11-19','cron'),async()=>data(10,6),async()=>{attempts++;return 'unexpected'});
  assert.ok('alreadySent' in result&&result.alreadySent);assert.equal(result.revision,2);assert.equal(attempts,0);
  await assert.rejects(db.query("INSERT INTO report_dispatches(org_id,start_date,end_date,recipient,report_hash,status,revision) VALUES($1,'2026-11-16','2026-11-19','qa@example.invalid',$2,'pending',3)",[org,'3'.repeat(64)]));
  assert.equal((await db.query('SELECT org_id FROM report_period_claims WHERE org_id=$1',[org])).rowCount,1);
 }finally{await pg.close()}
});
