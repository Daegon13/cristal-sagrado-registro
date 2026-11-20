import { chromium } from '@playwright/test';

const stage=process.argv[2];
if(!['request','verify'].includes(stage))throw new Error('Use request or verify');
if(!process.env.PREVIEW_ACCESS_URL)throw new Error('PREVIEW_ACCESS_URL required');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
try{
 await page.goto(process.env.PREVIEW_ACCESS_URL,{waitUntil:'domcontentloaded'});
 if(stage==='request'){
  if(!process.env.QA_EMAIL)throw new Error('QA_EMAIL required');
  await page.getByLabel('Correo electrónico').fill(process.env.QA_EMAIL);
  await page.getByRole('button',{name:'Enviarme un enlace de acceso'}).click();
  await page.getByText(/recibirás un enlace válido/).waitFor({timeout:15000});
  console.log('Magic Link solicitado para la identidad QA autorizada.');
 }else{
  if(!process.env.PREVIEW_MAGIC_URL)throw new Error('PREVIEW_MAGIC_URL required');
  await page.goto(process.env.PREVIEW_MAGIC_URL,{waitUntil:'domcontentloaded'});
  await page.getByText('Consultas recientes').waitFor({timeout:15000});
  const org=await page.evaluate(async()=>{const r=await fetch('/api/me',{cache:'no-store'});return {status:r.status,data:await r.json()}});
  if(org.status!==200||org.data.orgId!=='54911b5e-8018-4698-9a36-20d70e32acba')throw new Error('La sesión no pertenece a la org QA.');
  console.log('Sesión QA y membresía aislada comprobadas.');
  await page.reload();await page.getByText('Consultas recientes').waitFor({timeout:15000});
  console.log('Sesión persistente tras recarga en Chrome comprobada.');
  await page.getByRole('button',{name:'Nueva consulta'}).click();
  await page.getByRole('button',{name:'Guardar consulta'}).click();
  await page.getByText('Consulta registrada.').waitFor({timeout:15000});
  console.log('Consulta anónima real registrada en Preview.');
  await page.locator('.listitem').filter({hasText:'Consulta anónima'}).first().getByRole('button',{name:'Convertir en venta'}).click();
  await page.getByRole('button',{name:'Guardar venta y seguir a cobro'}).click();
  await page.getByRole('dialog',{name:'Registrar movimiento'}).waitFor({timeout:20000});
  await page.getByRole('dialog',{name:'Registrar movimiento'}).getByRole('button',{name:'Registrar cobro',exact:true}).click();
  await page.getByText('Movimiento registrado.').waitFor({timeout:15000});
  console.log('Venta y cobro ficticios registrados desde consulta.');
  const response=await page.evaluate(async()=>{const r=await fetch('/api/data?table=ad_campaigns',{cache:'no-store'});return r.status});
  if(response!==200)throw new Error(`Campañas Preview HTTP ${response}`);
  console.log('Tablas de publicidad accesibles con sesión QA.');
  await page.getByRole('button',{name:'Finanzas'}).click();
  await page.getByRole('button',{name:'+ Campaña'}).click();
  const campaign=page.getByRole('dialog',{name:'Nueva campaña'});
  await campaign.locator('input').nth(0).fill('QA ficticia · período cruzado');
  await campaign.locator('input[type=date]').nth(0).fill('2026-11-14');
  await campaign.locator('input[type=date]').nth(1).fill('2026-11-17');
  await campaign.getByRole('button',{name:'Total'}).click();
  await campaign.locator('input[type=number]').fill('1000');
  await campaign.getByRole('button',{name:'Guardar campaña'}).click();
  await page.getByText('Campaña registrada.').waitFor({timeout:15000});
  await page.getByRole('button',{name:'+ Gasto real del período'}).click();
  const spend=page.getByRole('dialog',{name:'Gasto real de Meta'});
  await spend.locator('select').selectOption({index:1});
  await spend.locator('input[type=date]').nth(0).fill('2026-11-14');
  await spend.locator('input[type=date]').nth(1).fill('2026-11-17');
  await spend.locator('input[type=number]').fill('200');
  await spend.getByRole('button',{name:'Guardar gasto real'}).click();
  await page.getByText('Gasto real de Meta registrado para el período.').waitFor({timeout:15000});
  await page.getByText(/Cobertura incompleta/).waitFor({timeout:15000});
  console.log('Campaña y gasto real cruzando semana registrados; cobertura incompleta visible.');
  const snapshot=await page.evaluate(async()=>{const r=await fetch('/api/export?format=json',{cache:'no-store'});return {status:r.status,data:await r.json()}});
  if(snapshot.status!==200||snapshot.data.orgId!==org.data.orgId||!snapshot.data.data.ad_campaigns?.length||!snapshot.data.data.ad_spend_entries?.length)throw new Error('Respaldo QA incompleto.');
  const actualCampaign=snapshot.data.data.ad_campaigns.find(c=>c.name==='QA ficticia · período cruzado');
  const actualSpend=snapshot.data.data.ad_spend_entries.find(e=>e.campaign_id===actualCampaign?.id);
  if(!actualSpend||Number(actualSpend.amount)!==200)throw new Error('El gasto no coincide con el respaldo.');
  console.log('Exportación JSON autenticada incluye campaña y gasto real correcto.');
  const denied=await page.evaluate(async()=>{
    const target='f397405c-e520-4172-b4d7-0d06b786b20f';
    const read=await fetch(`/api/data?table=contacts&orgId=${target}`);
    const exportResult=await fetch(`/api/export?format=json&orgId=${target}`);
    const write=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'inquiry',orgId:target,key:crypto.randomUUID(),source:'web'})});
    return [read.status,exportResult.status,write.status];
  });
  if(denied.some(status=>status!==403))throw new Error(`Aislamiento de org falló: ${denied.join(',')}`);
  console.log('Lectura, exportación y escritura entre organizaciones rechazadas (403).');
  const overlap=await page.evaluate(async({campaignId})=>{
    const r=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adSpend',orgId:'54911b5e-8018-4698-9a36-20d70e32acba',campaignId,startsOn:'2026-11-15',endsOn:'2026-11-17',amount:'100',key:crypto.randomUUID()})});return r.status;
  },{campaignId:actualCampaign.id});
  if(overlap!==409)throw new Error(`Solape publicitario no rechazado: ${overlap}`);
  console.log('Solape de gasto publicitario rechazado (409).');
  await page.getByRole('button',{name:'Corregir'}).first().click();
  const correction=page.getByRole('dialog',{name:'Corregir registro'});
  await correction.locator('textarea').fill('Ensayo QA de corrección');
  await correction.getByRole('button',{name:'Confirmar anulación'}).click();
  await page.getByText(/Registro anulado con historial/).waitFor({timeout:15000});
  const voided=await page.evaluate(async({id})=>{const r=await fetch('/api/export?format=json');const data=await r.json();return data.data.ad_spend_entries.find(e=>e.id===id)?.voided_at},{id:actualSpend.id});
  if(!voided)throw new Error('Anulación publicitaria no persistió.');
  console.log('Anulación de gasto publicitario persistida y auditada.');
 }
}finally{await browser.close()}
