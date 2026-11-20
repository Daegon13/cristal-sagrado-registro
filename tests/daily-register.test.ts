import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';
import { advertisingSummary } from '../lib/ads.ts';
import { fold, normalizeHandle } from '../lib/contact-search.ts';

test('handles, consultas anónimas, ventas y campañas conservan organizaciones',async()=>{
 const db=new PGlite();try{
  await db.exec(await readFile(new URL('../sql/003_neon_initial.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../sql/004_daily_register.sql',import.meta.url),'utf8'));
  const org=(await db.query<{id:string}>("INSERT INTO organizations(name) VALUES('QA ficticia'),('Otra org') RETURNING id")).rows.map(x=>x.id);
  const c=(await db.query<{id:string}>("INSERT INTO contacts(org_id,alias,instagram_handle,handle_confirmed,source,created_by) VALUES($1,'María','maria.uy',true,'instagram','qa') RETURNING id",[org[0]])).rows[0].id;
  await assert.rejects(db.query("INSERT INTO contacts(org_id,alias,instagram_handle,handle_confirmed,source,created_by) VALUES($1,'Otra María','maria.uy',true,'instagram','qa')",[org[0]]));
  await db.query("INSERT INTO contacts(org_id,alias,instagram_handle,source,created_by) VALUES($1,'Posible duplicado','maria.uy','instagram','qa')",[org[0]]);
  const inquiry=(await db.query<{id:string}>("INSERT INTO inquiries(org_id,contact_id,source,created_by,idempotency_key) VALUES($1,NULL,'instagram','qa',gen_random_uuid()) RETURNING id",[org[0]])).rows[0].id;
  await db.query('UPDATE inquiries SET contact_id=$1 WHERE org_id=$2 AND id=$3',[c,org[0],inquiry]);
  for(let n=0;n<3;n++)await db.query('INSERT INTO inquiries(org_id,contact_id,source,created_by,idempotency_key) VALUES($1,$2,\'instagram\',\'qa\',gen_random_uuid())',[org[0],c]);
  const sale=(await db.query<{id:string}>("INSERT INTO sales(org_id,contact_id,inquiry_id,service,agreed_amount,created_by,idempotency_key) VALUES($1,$2,$3,'Tarot',2500,'qa',gen_random_uuid()) RETURNING id",[org[0],c,inquiry])).rows[0].id;
  await assert.rejects(db.query("INSERT INTO sales(org_id,contact_id,inquiry_id,service,agreed_amount,created_by) VALUES($1,$2,$3,'Tarot',2500,'qa')",[org[1],c,inquiry]));
  await db.query("INSERT INTO payments(org_id,sale_id,amount,method,kind,idempotency_key,created_by) VALUES($1,$2,2500,'prex','payment',gen_random_uuid(),'qa')",[org[0],sale]);
  const campaign=(await db.query<{id:string}>("INSERT INTO ad_campaigns(org_id,name,starts_on,ends_on,budget_kind,budget_amount,created_by) VALUES($1,'Prueba','2026-11-16','2026-11-29','daily',100,'qa') RETURNING id",[org[0]])).rows[0].id;
  await assert.rejects(db.query("INSERT INTO ad_spend_entries(org_id,campaign_id,starts_on,ends_on,amount,idempotency_key,created_by) VALUES($1,$2,'2026-11-16','2026-11-22',600,gen_random_uuid(),'qa')",[org[1],campaign]));
  await db.query("INSERT INTO ad_spend_entries(org_id,campaign_id,starts_on,ends_on,amount,idempotency_key,created_by) VALUES($1,$2,'2026-11-16','2026-11-22',600,gen_random_uuid(),'qa')",[org[0],campaign]);
  await assert.rejects(db.query("INSERT INTO ad_spend_entries(org_id,campaign_id,starts_on,ends_on,amount,idempotency_key,created_by) VALUES($1,$2,'2026-11-20','2026-11-25',900,gen_random_uuid(),'qa')",[org[0],campaign]));
  assert.equal((await db.query('SELECT id FROM inquiries WHERE org_id=$1 AND contact_id=$2',[org[0],c])).rowCount,4);
  assert.equal(normalizeHandle('@María.UY'),'maria.uy');assert.equal(fold('  MÁRÍA'),'maria');
 }finally{await db.close()}
});

test('100, 300 y 500 clientes ficticios: búsqueda acotada y sin selector completo',async()=>{
 const db=new PGlite();try{
  await db.exec(await readFile(new URL('../sql/003_neon_initial.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../sql/004_daily_register.sql',import.meta.url),'utf8'));
  const org=(await db.query<{id:string}>("INSERT INTO organizations(name) VALUES('Carga ficticia') RETURNING id")).rows[0].id;
  for(const count of [100,300,500]){
   await db.query("INSERT INTO contacts(org_id,alias,instagram_handle,source,created_by) SELECT $1,'Cliente '||g,'cliente.'||g,'instagram','qa' FROM generate_series($2::integer,$3::integer) g",[org,count===100?1:count===300?101:301,count]);
   const t=performance.now();const rows=await db.query<{alias:string}>("SELECT alias FROM contacts WHERE org_id=$1 AND instagram_handle LIKE '%cliente.499%' ORDER BY created_at DESC LIMIT 10",[org]);
   assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM contacts WHERE org_id=$1',[org])).rows[0].n,count);
   assert.ok((rows.rowCount||0)<=10);if(count===500)assert.equal(rows.rows[0].alias,'Cliente 499');
   assert.ok(performance.now()-t<5000);
  }
 }finally{await db.close()}
});

test('un gasto que cruza semanas no se reparte ni se suma dos veces',()=>{
 const campaigns=[{starts_on:'2026-11-16',ends_on:'2026-11-29',budget_kind:'daily',budget_amount:100}];
 const entries=[{starts_on:'2026-11-19',ends_on:'2026-11-24',amount:900}];
 assert.deepEqual(advertisingSummary('2026-11-16','2026-11-22',campaigns,entries),{budget:700,spent:0,unallocated:1,partialBudgets:0,percent:null});
 assert.equal(advertisingSummary('2026-11-16','2026-11-29',campaigns,entries).spent,900);
});
