import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const preview=process.env.PREVIEW_ACCESS_URL;
if(!preview)throw new Error('PREVIEW_ACCESS_URL is required');
const orgId='11111111-1111-4111-8111-111111111111';
const now='2026-11-20T12:00:00.000Z';
type Row=Record<string,unknown>;

async function fixture(page:Page,count:number){
 const contacts:Row[]=Array.from({length:count},(_,n)=>({id:`${(n+1).toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`,org_id:orgId,alias:n===count-1?'María Última':`Cliente ${n+1}`,instagram_handle:n===count-1?'maria.ultima':`cliente.${n+1}`,display_name:null,handle_confirmed:false,merged_into:null,source:'instagram',created_at:now}));
 const inquiries:Row[]=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',org_id:orgId,contact_id:contacts.at(-1)?.id,source:'instagram',created_at:now},{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',org_id:orgId,contact_id:null,source:'web',created_at:now}];
 const sales:Row[]=[],payments:Row[]=[],expenses:Row[]=[],campaigns:Row[]=[],adSpends:Row[]=[],requests:Row[]=[];
 const tableRows:Record<string,Row[]>={contacts,inquiries,sales,payments,expenses,ad_campaigns:campaigns,ad_spend_entries:adSpends,audit_log:[]};
 await page.route('**/api/health',r=>r.fulfill({json:{status:'ok',configured:true}}));
 await page.route('**/api/auth/**',r=>r.fulfill({json:{session:{id:'session-qa',userId:'qa-user'},user:{id:'qa-user',email:'qa@example.invalid',name:'QA'}}}));
 await page.route('**/api/me',r=>r.fulfill({json:{orgId}}));
 await page.route('**/api/reports/send',async r=>{requests.push(r.request().postDataJSON());await r.fulfill({json:{ok:true}})});
 await page.route('**/api/data?**',async r=>{
  const u=new URL(r.request().url()),table=u.searchParams.get('table')||'';
  if(table==='contact_search'){
   const q=(u.searchParams.get('q')||'').replace(/^@/,'').toLowerCase();
   const rows=contacts.filter(c=>!q||String(c.alias).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)||String(c.instagram_handle).includes(q)).slice(-10).reverse().map(c=>({...c,inquiry_count:inquiries.filter(i=>i.contact_id===c.id).length,sale_count:sales.filter(s=>s.contact_id===c.id).length,has_payment:false}));
   return r.fulfill({json:{rows}});
  }
  const pageNumber=Number(u.searchParams.get('page')||0);const rows=tableRows[table]||[];
  return r.fulfill({json:{rows:rows.slice(pageNumber*200,(pageNumber+1)*200),hasMore:rows.length>(pageNumber+1)*200,orgId}});
 });
 await page.route('**/api/data',async r=>{
  if(r.request().method()!=='POST')return r.continue();
  const body=r.request().postDataJSON();requests.push(body);
  if(body.action==='sale'){
   const inquiry=inquiries.find(x=>x.id===body.inquiryId);const contactId=body.contactId||inquiry?.contact_id||contacts.at(-1)?.id;
   const id=randomUUID();sales.unshift({id,org_id:orgId,contact_id:contactId,inquiry_id:body.inquiryId||null,service:body.service,agreed_amount:body.amount,created_at:now,status:'open'});
   return r.fulfill({json:{id,contactId}});
  }
  if(body.action==='payment'){
   const id=randomUUID();payments.unshift({id,org_id:orgId,sale_id:body.saleId,amount:body.amount,method:body.method,kind:body.kind,received_at:now,voided_at:null});
   return r.fulfill({json:{id}});
  }
  return r.fulfill({json:{id:randomUUID()}});
 });
 return {contacts,inquiries,sales,payments,campaigns,adSpends,requests};
}

test('390 px: consulta → venta → cobro sin volver a buscar cliente; período exacto',async({page})=>{
 const data=await fixture(page,500);await page.goto(preview!);await expect(page.getByText('Consultas recientes')).toBeVisible();
 await mkdir('docs/screenshots',{recursive:true});
 await page.screenshot({path:'docs/screenshots/registro-390-inicio.png',fullPage:true});
 await page.getByRole('button',{name:'Convertir en venta'}).first().click();
 await expect(page.getByText('Desde consulta #aaaaaaaa')).toBeVisible();
 await page.screenshot({path:'docs/screenshots/registro-390-venta.png',fullPage:true});
 await page.getByRole('button',{name:'Guardar venta y seguir a cobro'}).click();
 await expect(page.getByText(/María Última · Amarre/)).toBeVisible();
 await page.getByRole('button',{name:'Registrar cobro',exact:true}).last().click();
 expect(data.sales).toHaveLength(1);expect(data.payments).toHaveLength(1);
 expect(data.requests.filter(x=>x.action==='sale')).toHaveLength(1);
 expect(data.requests.filter(x=>x.action==='payment')).toHaveLength(1);
 await page.getByRole('button',{name:'Informe',exact:true}).click();
 await page.locator('input[type=date]').first().fill('2026-11-19');
 await page.locator('input[type=date]').last().fill('2026-11-19');
 await expect(page.getByText('Se enviará exactamente:')).toContainText('2026-11-19 a 2026-11-19');
 await page.getByRole('checkbox',{name:'Confirmo estas dos fechas'}).check();
 await page.screenshot({path:'docs/screenshots/registro-390-informe.png',fullPage:true});
 await page.getByRole('button',{name:'Enviar 2026-11-19 a 2026-11-19'}).click();
 expect(data.requests.find(x=>x.start==='2026-11-19')).toMatchObject({start:'2026-11-19',end:'2026-11-19'});
});

for(const count of [100,300,500])test(`390 px: búsqueda con ${count} clientes ficticios`,async({page})=>{
 await fixture(page,count);await page.goto(preview!);await expect(page.getByText('Consultas recientes')).toBeVisible();
 await page.getByRole('button',{name:'Nueva venta'}).click();
 const combo=page.getByRole('combobox',{name:'Cliente',exact:true});await combo.fill('@maria.ultima');
 await expect(page.getByRole('option',{name:/María Última/})).toBeVisible();
 await page.getByRole('option',{name:/María Última/}).click();
 await expect(page.getByRole('button',{name:'Guardar venta y seguir a cobro'})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('390 px: ejecución de publicidad y cobertura visibles',async({page})=>{
 const data=await fixture(page,100);
 data.campaigns.push({id:randomUUID(),org_id:orgId,name:'Campaña ficticia',starts_on:'2026-11-16',ends_on:'2026-11-20',budget_kind:'daily',budget_amount:'100'});
 data.adSpends.push({id:randomUUID(),org_id:orgId,campaign_id:data.campaigns[0].id,starts_on:'2026-11-16',ends_on:'2026-11-20',amount:'600',voided_at:null,note:null});
 await page.goto(preview!);await page.getByRole('button',{name:'Finanzas'}).click();
 await expect(page.getByText(/Ejecución: 120%/)).toBeVisible();
 await expect(page.getByText(/Presupuesto superado/)).toBeVisible();
 await expect(page.getByText(/no modifica ni detiene campañas en Meta/)).toBeVisible();
 await page.screenshot({path:'docs/screenshots/registro-390-publicidad.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('captura anterior a issue #2 en el Preview del commit previo',async({page})=>{
 if(!process.env.BEFORE_ACCESS_URL)test.skip();
 await fixture(page,500);await page.goto(process.env.BEFORE_ACCESS_URL!);
 await expect(page.getByText('Resumen semanal')).toBeVisible();
 await page.screenshot({path:'docs/screenshots/registro-390-antes.png',fullPage:true});
});
