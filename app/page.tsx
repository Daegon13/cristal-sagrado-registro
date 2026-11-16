'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowDownToLine, CircleDollarSign, CreditCard, LogOut, Mail, MessageCircle, Plus, RefreshCw, Users, Wallet, X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { localToday, currentLocalWeek } from '@/lib/time';
import { netReceived, costsRecorded } from '@/lib/finance';
import { Contact, Inquiry, Sale, Payment, Expense, AuditEntry, money, SOURCES, METHODS, SERVICES } from '@/lib/types';

type Modal = null|'inquiry'|'sale'|'payment'|'expense'|'report'|'editContact'|'void';
type Tab='home'|'contacts'|'sales'|'finance';
const isoToday=()=>localToday();
const dateTime=(s:string)=>new Date(s).toLocaleString('es-UY',{timeZone:'America/Montevideo',dateStyle:'short',timeStyle:'short'});
const currentWeek=()=>currentLocalWeek();
const safeErr=(error:unknown)=>error instanceof Error?error.message:String(error);

export default function Home(){
 const supa=useMemo(()=>getSupabase(),[]);
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [orgId,setOrgId]=useState(''),[tab,setTab]=useState<Tab>('home'),[modal,setModal]=useState<Modal>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [contacts,setContacts]=useState<Contact[]>([]),[inquiries,setInquiries]=useState<Inquiry[]>([]),[sales,setSales]=useState<Sale[]>([]),[payments,setPayments]=useState<Payment[]>([]),[expenses,setExpenses]=useState<Expense[]>([]);
 const [alias,setAlias]=useState(''),[source,setSource]=useState('instagram'),[selectedContact,setSelectedContact]=useState(''),[service,setService]=useState(SERVICES[0]),[price,setPrice]=useState('2500');
 const [selectedSale,setSelectedSale]=useState(''),[paymentAmount,setPaymentAmount]=useState(''),[method,setMethod]=useState('prex'),[paymentKind,setPaymentKind]=useState('payment');
 const [expenseAmount,setExpenseAmount]=useState(''),[expenseCategory,setExpenseCategory]=useState('ads'),[expenseDate,setExpenseDate]=useState(isoToday()),[expenseNote,setExpenseNote]=useState('');
 const [period,setPeriod]=useState(()=>({...currentWeek(),end:localToday()}));
 const [contactQuery,setContactQuery]=useState(''),[editedContact,setEditedContact]=useState(''),[editAlias,setEditAlias]=useState('');
 const [voidTarget,setVoidTarget]=useState<{table:'payments'|'expenses';id:string}|null>(null),[voidReason,setVoidReason]=useState('');
 const [audit,setAudit]=useState<AuditEntry[]>([]);
 const inquiryKey=useRef(crypto.randomUUID()),paymentKey=useRef(crypto.randomUUID()),expenseKey=useRef(crypto.randomUUID());
 const refresh=useCallback(async(id:string)=>{
   if(!supa||!id)return;
   const [c,i,s,p,e,a]=await Promise.all([
    supa.from('contacts').select('*',{count:'exact'}).eq('org_id',id).order('created_at',{ascending:false}).limit(2000),
    supa.from('inquiries').select('*',{count:'exact'}).eq('org_id',id).order('created_at',{ascending:false}).limit(2000),
    supa.from('sales').select('*',{count:'exact'}).eq('org_id',id).order('created_at',{ascending:false}).limit(2000),
    supa.from('payments').select('*',{count:'exact'}).eq('org_id',id).order('received_at',{ascending:false}).limit(2000),
    supa.from('expenses').select('*',{count:'exact'}).eq('org_id',id).order('occurred_on',{ascending:false}).limit(2000),
    supa.from('audit_log').select('id,table_name,operation,created_at,actor,before_data,after_data').eq('org_id',id).order('created_at',{ascending:false}).limit(60),
   ]);
   if([c,i,s,p,e,a].some(r=>r.error||((r.count??0)>(r.data?.length??0)))){setContacts([]);setInquiries([]);setSales([]);setPayments([]);setExpenses([]);setAudit([]);setError('No se pudieron recuperar todos los registros completos. Revisá tu conexión o solicitá exportación paginada.');return}
   setContacts(c.data||[]);setInquiries(i.data||[]);setSales(s.data||[]);setPayments(p.data||[]);setExpenses(e.data||[]);setAudit((a.data||[]) as AuditEntry[]);
 },[supa]);
 useEffect(()=>{
   if(!supa){setLoading(false);return}
   let active=true;
   const session=supa.auth.getUser().then(async({data})=>{if(!active)return;setUser(data.user);setLoading(false)});
   const {data:auth}=supa.auth.onAuthStateChange((_event,session)=>{if(active)setUser(session?.user??null)});
   return ()=>{active=false;void session;auth.subscription.unsubscribe()};
 },[supa]);
 useEffect(()=>{
  if(!user||!supa){setOrgId('');return}
  let active=true;
  void supa.from('memberships').select('org_id').eq('user_id',user.id).limit(1).maybeSingle().then(({data,error})=>{
    if(!active)return;
    if(error){setError('No se pudo verificar la organización.');return}
    if(!data){setError('Tu usuario todavía no pertenece a una organización. Pedile al administrador que complete la configuración.');return}
    setOrgId(data.org_id);void refresh(data.org_id);
  });return()=>{active=false};
 },[user,supa,refresh]);
 const person=(id:string)=>contacts.find(x=>x.id===id)?.alias||'Cliente';
 const sale=(id:string)=>sales.find(x=>x.id===id);
 const thisWeek=useMemo(()=>{
  const start=`${period.start}T03:00:00Z`;const endDate=new Date(`${period.end}T12:00:00Z`);endDate.setUTCDate(endDate.getUTCDate()+1);const end=`${endDate.toISOString().slice(0,10)}T03:00:00Z`;
  const p=payments.filter(x=>!x.voided_at&&x.received_at>=start&&x.received_at<end),e=expenses.filter(x=>!x.voided_at&&x.occurred_on>=period.start&&x.occurred_on<=period.end),i=inquiries.filter(x=>x.created_at>=start&&x.created_at<end);
  const collected=netReceived(p);
  return {collected,expenses:costsRecorded(e),clients:new Set(p.filter(x=>x.kind==='payment').map(x=>sale(x.sale_id)?.contact_id).filter(Boolean)).size,inquiries:i.length};
 },[payments,expenses,inquiries,period,sales]);
 function show(m:Modal){setNotice('');setError('');setModal(m);if(m==='payment'){setSelectedSale('');setPaymentAmount('');paymentKey.current=crypto.randomUUID()}if(m==='expense'){expenseKey.current=crypto.randomUUID()}if(m==='inquiry'){setAlias('');setSelectedContact('');setSource('instagram');inquiryKey.current=crypto.randomUUID()}}
 function showEdit(c:Contact){setEditedContact(c.id);setEditAlias(c.alias);show('editContact')}
 function showVoid(table:'payments'|'expenses',id:string){setVoidTarget({table,id});setVoidReason('');show('void')}
 async function execute(task:()=>Promise<{error?:{message:string}|null}>,success:string){setBusy(true);setError('');setNotice('');try{const r=await task();if(r.error)throw new Error(r.error.message);setModal(null);setNotice(success);await refresh(orgId)}catch(e){setError(safeErr(e))}finally{setBusy(false)}}
 async function submitLogin(e:FormEvent){e.preventDefault();if(!supa)return;setBusy(true);setError('');const r=await supa.auth.signInWithPassword({email,password});if(r.error)setError('No se pudo iniciar sesión. Comprobá el correo y la contraseña.');setBusy(false)}
 async function submitInquiry(e:FormEvent){e.preventDefault();if(!supa||!user||!orgId||busy)return;
  setBusy(true);setError('');setNotice('');try{
   const r=await supa.rpc('register_inquiry', {p_org_id:orgId,p_source:source,p_alias:alias.trim(),p_contact_id:selectedContact||null,p_key:inquiryKey.current});
   if(r.error)throw r.error;
   setModal(null);setNotice('Consulta registrada.');inquiryKey.current=crypto.randomUUID();await refresh(orgId);
  }catch(e){setError(safeErr(e))}finally{setBusy(false)}
 }
 async function submitEditContact(e:FormEvent){e.preventDefault();if(!supa||!orgId||!editedContact||!editAlias.trim())return;
  await execute(()=>supa.from('contacts').update({alias:editAlias.trim().slice(0,100)}).eq('id',editedContact).eq('org_id',orgId),'Alias actualizado. El cambio quedó en el historial.');
 }
 async function submitVoid(e:FormEvent){e.preventDefault();if(!supa||!orgId||!voidTarget||voidReason.trim().length<6)return;
  await execute(()=>supa.from(voidTarget.table).update({voided_at:new Date().toISOString(),void_reason:voidReason.trim().slice(0,240)}).eq('id',voidTarget.id).eq('org_id',orgId).is('voided_at',null),'Registro anulado con historial. Si correspondía un importe distinto, cargá un nuevo asiento correcto.');
 }
 async function submitSale(e:FormEvent){e.preventDefault();if(!supa||!user||!selectedContact||!(Number(price)>0))return;
  await execute(()=>supa.from('sales').insert({org_id:orgId,contact_id:selectedContact,service,agreed_amount:Number(price),created_by:user.id}),'Venta registrada.');}
 async function submitPayment(e:FormEvent){e.preventDefault();if(!supa||!user||!selectedSale||!(Number(paymentAmount)>0))return;
  await execute(()=>supa.from('payments').insert({org_id:orgId,sale_id:selectedSale,amount:Number(paymentAmount),kind:paymentKind,method,created_by:user.id,idempotency_key:paymentKey.current}),'Movimiento registrado.');}
 async function submitExpense(e:FormEvent){e.preventDefault();if(!supa||!user||!(Number(expenseAmount)>0))return;
  await execute(()=>supa.from('expenses').insert({org_id:orgId,amount:Number(expenseAmount),category:expenseCategory,occurred_on:expenseDate,note:expenseNote||null,idempotency_key:expenseKey.current,created_by:user.id}),'Gasto registrado.');}
 async function submitReport(e:FormEvent){e.preventDefault();if(!supa||!orgId)return;setBusy(true);setError('');setNotice('');try{
  const session=await supa.auth.getSession();const token=session.data.session?.access_token;if(!token)throw new Error('Sesión vencida.');
  const r=await fetch('/api/reports/send',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({orgId,start:period.start,end:period.end}),cache:'no-store'});
  const j=await r.json();if(!r.ok)throw new Error(j.error||'Error al enviar');setModal(null);setNotice(j.alreadySent?'Ese mismo informe ya había sido enviado.':'El correo fue aceptado para envío.');
 }catch(e){setError(safeErr(e))}finally{setBusy(false)}}
 function downloadSnapshot(){
  const report={schema:'cristal-sagrado-snapshot/v1',exportedAt:new Date().toISOString(),contacts,inquiries,sales,payments,expenses};
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`cs-registro-${isoToday()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),3000);
 }
 if(loading)return <main><p>Cargando acceso privado…</p></main>;
 if(!supa)return <main><div className="card login"><h2>Configuración pendiente</h2><p className="muted">La aplicación necesita las variables públicas de Supabase para habilitar el inicio de sesión. Consultá el README.</p></div></main>;
 if(!user)return <main><div className="card login stack"><div className="brand">☾ Cristal Sagrado</div><h2>Registro privado</h2><p className="sub">Ingresá con la cuenta autorizada. No hay registro público.</p><form onSubmit={submitLogin} className="stack"><div className="field"><label>Correo electrónico</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></div><div className="field"><label>Contraseña</label><input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></div><button className="primary full" disabled={busy}>Entrar</button></form>{error&&<p className="error" role="alert">{error}</p>}</div></main>;
 if(!orgId)return <main><div className="card login stack"><div className="brand">☾ Cristal Sagrado</div><h2>Verificando acceso</h2><p className="muted">{error||'Cargando organización autorizada…'}</p><button className="secondary" onClick={()=>void supa.auth.signOut()}>Cerrar sesión</button></div></main>;
 return <main>
  <header className="top"><div><div className="brand">☾ Cristal Sagrado</div><div className="sub">Clientes, ventas y cobros</div></div><button className="secondary small" title="Cerrar sesión" onClick={()=>void supa.auth.signOut()}><LogOut size={16}/></button></header>
  {!orgId&&<p className="notice">La organización todavía no está configurada. Consultá las instrucciones del README.</p>}
  {notice&&<p className="success" role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
  <nav className="tabs" aria-label="Secciones">{([['home','Inicio'],['contacts','Clientes'],['sales','Ventas'],['finance','Finanzas']] as const).map(([key,label])=><button key={key} className={'tab '+(tab===key?'active':'')} onClick={()=>setTab(key)}>{label}</button>)}</nav>
  {tab==='home'&&<><div className="hero"><div className="label">Cobrado · semana seleccionada</div><div className="heroValue">{money(thisWeek.collected)}</div><div className="sub">{thisWeek.clients} clientes pagos · {thisWeek.inquiries} consultas</div></div><div className="grid actions"><button className="action" disabled={!orgId} onClick={()=>show('inquiry')}><MessageCircle/><span>Consulta IG</span></button><button className="action" disabled={!orgId||!contacts.length} onClick={()=>show('sale')}><Plus/><span>Nueva venta</span></button><button className="action" disabled={!orgId||!sales.length} onClick={()=>show('payment')}><CreditCard/><span>Registrar cobro</span></button><button className="action" disabled={!orgId} onClick={()=>show('expense')}><CircleDollarSign/><span>Gasto</span></button></div>
    <div className="card stack"><div className="row"><h2>Resumen semanal</h2><button className="secondary small" onClick={()=>void refresh(orgId)}><RefreshCw size={14}/></button></div><div className="grid"><div><div className="label">Ingresos</div><div className="stat">{money(thisWeek.collected)}</div></div><div><div className="label">Gastos</div><div className="stat">{money(thisWeek.expenses)}</div></div><div><div className="label">Diferencia parcial</div><div className="stat">{money(thisWeek.collected-thisWeek.expenses)}</div></div><div><div className="label">Consultas</div><div className="stat">{thisWeek.inquiries}</div></div></div><p className="help">Cifras basadas en registros introducidos aquí. No representan conciliación bancaria ni beneficio neto.</p><div className="row"><button className="secondary small" onClick={()=>show('report')}><Mail size={14}/> Enviar informe</button><button className="secondary small" onClick={downloadSnapshot}><ArrowDownToLine size={14}/> Exportar datos</button></div></div>
  </>}
  {tab==='contacts'&&<div className="card"><div className="row"><h2>Clientes ({contacts.length})</h2><button className="secondary small" onClick={()=>show('inquiry')}>+ Consulta</button></div><input aria-label="Buscar clientes" value={contactQuery} onChange={e=>setContactQuery(e.target.value)} placeholder="Buscar cliente por alias…" />{contacts.filter(c=>c.alias.toLocaleLowerCase('es-UY').includes(contactQuery.toLocaleLowerCase('es-UY'))).slice(0,100).map(c=><div className="listitem row" key={c.id}><div><strong>{c.alias}</strong><div className="sub">{SOURCES.find(s=>s.value===c.source)?.label||c.source} · {dateTime(c.created_at)}</div></div><div className="row"><span className="sub">{sales.filter(s=>s.contact_id===c.id).length} ventas</span><button className="secondary small" onClick={()=>showEdit(c)}>Editar</button></div></div>)}{!contacts.length&&<p className="muted">Todavía no hay clientes registrados.</p>}</div>}
  {tab==='sales'&&<div className="card"><div className="row"><h2>Ventas ({sales.length})</h2><button className="secondary small" onClick={()=>show('sale')}>+ Venta</button></div>{sales.slice(0,100).map(s=>{const paid=payments.filter(p=>!p.voided_at&&p.sale_id===s.id).reduce((v,p)=>v+Number(p.amount)*(p.kind==='refund'?-1:1),0);return <div className="listitem" key={s.id}><div className="row"><strong>{s.service}</strong><span>{money(Number(s.agreed_amount))}</span></div><div className="row sub"><span>{person(s.contact_id)} · {dateTime(s.created_at)}</span><span>Cobrado {money(paid)}</span></div></div>})}{!sales.length&&<p className="muted">Todavía no hay ventas.</p>}</div>}
  {tab==='finance'&&<div className="stack"><div className="card stack"><h2>Finanzas</h2><div className="grid"><div><div className="label">Cobrado</div><div className="stat">{money(thisWeek.collected)}</div></div><div><div className="label">Gastos</div><div className="stat">{money(thisWeek.expenses)}</div></div></div><button className="primary" onClick={()=>show('report')}>Enviar informe por Gmail</button><button className="secondary" onClick={downloadSnapshot}>Exportar respaldo JSON</button></div><div className="card"><h2>Últimos cobros y devoluciones</h2>{payments.slice(0,40).map(p=><div className={'listitem row '+(p.voided_at?'voided':'')} key={p.id}><div>{person(sale(p.sale_id)?.contact_id||'')}<div className="sub">{p.method} · {dateTime(p.received_at)}</div></div><div className="stack compact"><strong>{p.kind==='refund'?'−':'+'}{money(Number(p.amount))}</strong>{p.voided_at?<span className="sub">Anulado</span>:<button className="secondary tiny" onClick={()=>showVoid('payments',p.id)}>Corregir</button>}</div></div>)}{!payments.length&&<p className="muted">Sin movimientos.</p>}</div><div className="card"><h2>Gastos registrados</h2>{expenses.slice(0,40).map(e=><div className={'listitem row '+(e.voided_at?'voided':'')} key={e.id}><div>{e.category}<div className="sub">{e.occurred_on}</div></div><div className="stack compact"><strong>{money(Number(e.amount))}</strong>{e.voided_at?<span className="sub">Anulado</span>:<button className="secondary tiny" onClick={()=>showVoid('expenses',e.id)}>Corregir</button>}</div></div>)}</div><div className="card"><h2>Historial de movimientos</h2><p className="help">Últimos 60 eventos auditados, incluyendo cambios y anulaciones. Los datos históricos no se borran.</p>{audit.slice(0,60).map(a=><div className="listitem row" key={a.id}><div><strong>{({contacts:'Cliente',inquiries:'Consulta',sales:'Venta',payments:'Cobro',expenses:'Gasto'} as Record<string,string>)[a.table_name]||a.table_name}</strong><div className="sub">{a.operation==='UPDATE'?'Modificación':a.operation==='DELETE'?'Eliminación':'Creación'} · {dateTime(a.created_at)}</div></div><span className="sub">{a.after_data?.voided_at?'Anulado':a.operation}</span></div>)}</div></div>}
  {modal&&<div className="modalBackdrop" onMouseDown={ev=>{if(ev.target===ev.currentTarget&&!busy)setModal(null)}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-heading"><div className="modalHeader"><h2 id="dialog-heading">{{inquiry:'Registrar consulta',sale:'Registrar venta',payment:'Registrar movimiento',expense:'Registrar gasto',report:'Informe a Gmail',editContact:'Editar alias',void:'Anular registro erróneo'}[modal]}</h2><button className="close" aria-label="Cerrar" onClick={()=>setModal(null)} disabled={busy}><X/></button></div>
   {modal==='editContact'&&<form className="stack" onSubmit={submitEditContact}><div className="field"><label>Alias del cliente</label><input required maxLength={100} value={editAlias} onChange={e=>setEditAlias(e.target.value)}/></div><p className="help">Modificar el alias no elimina el dato anterior: queda en la auditoría.</p><button disabled={busy||!editAlias.trim()} className="primary full">Guardar corrección</button></form>}
   {modal==='void'&&<form className="stack" onSubmit={submitVoid}><p className="help">La anulación no borra el asiento. No corresponde usar «devolución» para corregir un error de carga. Después ingresá el movimiento correcto.</p><div className="field"><label>Motivo de la corrección (mínimo 6 caracteres)</label><textarea required rows={3} maxLength={240} value={voidReason} onChange={e=>setVoidReason(e.target.value)} placeholder="Ej.: Error al ingresar el importe" /></div><button disabled={busy||voidReason.trim().length<6} className="primary full">Confirmar anulación</button></form>}
   {modal==='inquiry'&&<form className="stack" onSubmit={submitInquiry}><div className="field"><label>Origen</label><div className="chips">{SOURCES.map(s=><button type="button" key={s.value} className={'chip '+(source===s.value?'active':'')} onClick={()=>setSource(s.value)}>{s.label}</button>)}</div></div><div className="field"><label>Cliente existente (opcional)</label><select value={selectedContact} onChange={e=>setSelectedContact(e.target.value)}><option value="">Nuevo cliente</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.alias}</option>)}</select></div>{!selectedContact&&<div className="field"><label>Alias para reconocerlo (opcional)</label><input maxLength={100} placeholder="Ej.: IG · María" value={alias} onChange={e=>setAlias(e.target.value)}/></div>}<p className="help">Si una consulta se reintenta por mala conexión, la app conserva su identificador para evitar duplicados. Un nuevo contacto anónimo se guarda con alias temporal. Si la persona vuelve a escribir, elegí el cliente existente para evitar duplicados.</p><button disabled={busy} className="primary full">{busy?'Guardando…':'Guardar consulta'}</button></form>}
   {modal==='sale'&&<form className="stack" onSubmit={submitSale}><div className="field"><label>Cliente</label><select required value={selectedContact} onChange={e=>setSelectedContact(e.target.value)}><option value="">Seleccioná un cliente</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.alias}</option>)}</select></div><div className="field"><label>Servicio</label><select value={service} onChange={e=>setService(e.target.value)}>{SERVICES.map(s=><option key={s}>{s}</option>)}</select></div><div className="field"><label>Importe acordado ($U)</label><input type="number" step="0.01" min="0.01" required value={price} onChange={e=>setPrice(e.target.value)}/></div><button disabled={busy||!selectedContact} className="primary full">Guardar venta</button></form>}
   {modal==='payment'&&<form className="stack" onSubmit={submitPayment}><div className="field"><label>Venta</label><select required value={selectedSale} onChange={e=>setSelectedSale(e.target.value)}><option value="">Seleccioná una venta</option>{sales.map(s=><option key={s.id} value={s.id}>{person(s.contact_id)} · {s.service} · {money(Number(s.agreed_amount))}</option>)}</select></div><div className="field"><label>Movimiento</label><div className="chips"><button type="button" className={'chip '+(paymentKind==='payment'?'active':'')} onClick={()=>setPaymentKind('payment')}>Cobro</button><button type="button" className={'chip '+(paymentKind==='refund'?'active':'')} onClick={()=>setPaymentKind('refund')}>Devolución</button></div></div><div className="field"><label>Importe ($U)</label><input required type="number" step="0.01" min="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></div><div className="field"><label>Medio de pago</label><div className="chips">{METHODS.map(m=><button type="button" key={m.value} className={'chip '+(method===m.value?'active':'')} onClick={()=>setMethod(m.value)}>{m.label}</button>)}</div></div><button disabled={busy||!selectedSale||!(Number(paymentAmount)>0)} className="primary full">Registrar {paymentKind==='refund'?'devolución':'cobro'}</button></form>}
   {modal==='expense'&&<form className="stack" onSubmit={submitExpense}><div className="field"><label>Tipo de gasto</label><div className="chips">{[['ads','Publicidad'],['materials','Materiales'],['fees','Comisiones'],['other','Otro']].map(([v,l])=><button type="button" key={v} className={'chip '+(expenseCategory===v?'active':'')} onClick={()=>setExpenseCategory(v)}>{l}</button>)}</div></div><div className="field"><label>Importe ($U)</label><input required type="number" min="0.01" step="0.01" value={expenseAmount} onChange={e=>setExpenseAmount(e.target.value)}/></div><div className="field"><label>Fecha</label><input required type="date" value={expenseDate} onChange={e=>setExpenseDate(e.target.value)}/></div><div className="field"><label>Nota opcional</label><textarea rows={2} value={expenseNote} onChange={e=>setExpenseNote(e.target.value)}/></div><p className="help">Para publicidad, anotá el gasto real del período indicado por Meta Ads Manager, evitando contabilizar otra vez el mismo gasto mediante recibos.</p><button disabled={busy} className="primary full">Guardar gasto</button></form>}
   {modal==='report'&&<form className="stack" onSubmit={submitReport}><p className="help">Se enviarán métricas agregadas, un JSON estructurado y archivos CSV sin nombres de clientes al correo configurado en el servidor.</p><div className="field"><label>Desde</label><input type="date" required value={period.start} onChange={e=>setPeriod(v=>({...v,start:e.target.value}))}/></div><div className="field"><label>Hasta (fecha de hoy o anterior)</label><input type="date" required max={isoToday()} value={period.end} onChange={e=>setPeriod(v=>({...v,end:e.target.value}))}/></div><button disabled={busy||period.end>isoToday()||period.start>period.end} className="primary full">{busy?'Enviando…':'Enviar informe'}</button></form>}
   {error&&<p className="error" role="alert">{error}</p>}
  </div></div>}
 </main>;
}
