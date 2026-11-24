'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isValidCalendarDate, localToday } from '@/lib/time';
import { reportDeliveryDisabled } from '@/lib/experiment-policy';

type Metric={key:string;before:number;now:number;change:number};
type Status={period:{start:string;end:string};current:Record<string,number>;previous:{id:string;revision:number;status:string;sentAt:string|null;hashPrefix:string;hasSnapshot:boolean}|null;differences:Metric[]|null;history:Array<{id:string;revision:number;status:string;dispatch_kind:string;trigger_source:string;supersedes_id:string|null;reissue_reason?:string|null;dispatched_at:string|null}>;canReissue:boolean};
const labels:Record<string,string>={inquiries:'Consultas',newSales:'Ventas',grossPayments:'Cobros brutos',refunds:'Devoluciones',netReceived:'Cobrado neto',expenses:'Gastos',advertisingSpend:'Publicidad',recordedCashDifference:'Diferencia parcial'};

export function ReportForm({orgId,initialPeriod,onSuccess}:{orgId:string;initialPeriod:{start:string;end:string};onSuccess:(message:string)=>void}){
 const [period,setPeriod]=useState(initialPeriod),[status,setStatus]=useState<Status|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false),[reissueConfirmed,setReissueConfirmed]=useState(false),[reason,setReason]=useState('');
 const requestKey=useRef(crypto.randomUUID());
 const valid=isValidCalendarDate(period.start)&&isValidCalendarDate(period.end)&&period.start<=period.end&&period.end<=localToday();
 useEffect(()=>{
  if(!valid){setStatus(null);setLoading(false);return}
  const controller=new AbortController();setStatus(null);setLoading(true);setError('');
  const timer=setTimeout(async()=>{
   try{const params=new URLSearchParams({orgId,start:period.start,end:period.end});const response=await fetch(`/api/reports/status?${params}`,{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo revisar el informe.');setStatus(data)}
   catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'No se pudo revisar el informe.')}
   finally{if(!controller.signal.aborted)setLoading(false)}
  },250);
  return()=>{clearTimeout(timer);controller.abort()};
 },[orgId,period.start,period.end,valid]);
 function change(which:'start'|'end',value:string){setPeriod(current=>({...current,[which]:value}));setConfirmed(false);setReissueConfirmed(false);setReason('');requestKey.current=crypto.randomUUID()}
 async function submit(event:FormEvent){
  event.preventDefault();if(reportDeliveryDisabled||!valid||!status||busy)return;
  const previous=status.previous,reissue=!!previous;
  if(reissue&&(!status.canReissue||previous.status==='pending'||reason.trim().length<10||!reissueConfirmed))return;
  if(!reissue&&!confirmed)return;
  setBusy(true);setError('');
  try{
   const body=reissue?{orgId,start:period.start,end:period.end,mode:'reissue',reason:reason.trim(),expectedDispatchId:previous!.id,requestKey:requestKey.current,confirm:true}:{orgId,start:period.start,end:period.end,mode:'initial'};
   const response=await fetch('/api/reports/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'}),data=await response.json();
   if(!response.ok)throw new Error(data.error||'No se pudo enviar el informe.');
   onSuccess(data.alreadySent?`Informe de ${period.start} a ${period.end} ya emitido; no se envió otro correo.`:`Informe de ${period.start} a ${period.end}, revisión ${data.revision}, aceptado para envío.`);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo enviar el informe.');setLoading(true);try{const params=new URLSearchParams({orgId,start:period.start,end:period.end});const r=await fetch(`/api/reports/status?${params}`,{cache:'no-store'});if(r.ok)setStatus(await r.json())}finally{setLoading(false)}}finally{setBusy(false)}
 }
 const previous=status?.previous,changed=status?.differences?.filter(x=>x.change!==0)||[];
 return <form className="stack" onSubmit={submit}>
  {reportDeliveryDisabled&&<p className="notice">Envío de informes desactivado durante el ensayo en Netlify. Podés revisar el historial y las métricas sin generar correos.</p>}
  <p className="help">Valor inicial: período visible en Inicio. El historial y las métricas pueden revisarse sin enviar correos.</p>
  <div className="grid two"><div className="field"><label htmlFor="report-start">Desde</label><input id="report-start" type="date" required value={period.start} onChange={e=>change('start',e.target.value)}/></div><div className="field"><label htmlFor="report-end">Hasta</label><input id="report-end" type="date" required max={localToday()} value={period.end} onChange={e=>change('end',e.target.value)}/></div></div>
  <p className="reportConfirm">{reportDeliveryDisabled?'Período seleccionado:':'Se enviará exactamente:'} <strong>{period.start} a {period.end}</strong> (Montevideo)</p>
  {loading&&<p className="help" role="status">Revisando historial del período…</p>}
  {!loading&&status&&!previous&&<><p className="notice">Todavía no se emitió este período. {reportDeliveryDisabled?'El envío está pausado.':'Se creará la revisión 1.'}</p><label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Confirmo estas dos fechas</label><button className="primary full" disabled={reportDeliveryDisabled||busy||!confirmed||!valid}>{busy?'Enviando…':`Enviar ${period.start} a ${period.end}`}</button></>}
  {!loading&&previous&&<><p className="notice">Informe ya emitido · revisión {previous.revision} · {previous.status==='sent'?'enviado':previous.status==='pending'?'pendiente de conciliación':'fallido; requiere revisión'}{previous.sentAt?` · ${new Date(previous.sentAt).toLocaleString('es-UY',{timeZone:'America/Montevideo'})}`:''}. No se envía otro correo por cambios en los datos.</p>
   {status?.differences===null?<p className="help">No hay comparación guardada del informe anterior. La revisión histórica se conserva sin alterar.</p>:<div className="stack compact"><strong>Diferencias desde esa revisión</strong>{changed.length?changed.map(x=><div className="row sub" key={x.key}><span>{labels[x.key]||x.key}</span><span>{x.before} → {x.now} ({x.change>0?'+':''}{x.change})</span></div>):<p className="help">Sin cambios en las métricas agregadas.</p>}</div>}
   {!!status?.history?.length&&<details><summary>Historial de revisiones ({status.history.length})</summary><div className="stack compact">{status.history.map(entry=><div className="listitem" key={entry.id}><strong>Revisión {entry.revision} · {entry.status}</strong><div className="sub">{entry.dispatch_kind==='legacy'?'Histórica':entry.trigger_source==='cron'?'Cron':'Manual'}{entry.supersedes_id?` · reemplaza #${entry.supersedes_id.slice(0,8)}`:''}</div>{entry.reissue_reason&&<div className="sub">Motivo: {entry.reissue_reason}</div>}</div>)}</div></details>}
   {status?.canReissue&&previous.status!=='pending'&&<><div className="field"><label htmlFor="report-reason">Motivo de reemisión administrativa (mínimo 10 caracteres)</label><textarea id="report-reason" rows={2} maxLength={240} value={reason} onChange={e=>setReason(e.target.value)}/></div><p className="help">Se registrará la revisión {previous.revision+1}, vinculada a la revisión {previous.revision}, con historial y motivo. {reportDeliveryDisabled?'El envío está pausado.':'Puede generar otro correo.'}</p><label className="check"><input type="checkbox" checked={reissueConfirmed} onChange={e=>setReissueConfirmed(e.target.checked)}/> Confirmo la reemisión de {period.start} a {period.end}</label><button className="primary full" disabled={reportDeliveryDisabled||busy||!valid||!reissueConfirmed||reason.trim().length<10}>{busy?'Enviando…':`Reemitir revisión ${previous.revision+1}`}</button></>}
  </>}
  {error&&<p className="error" role="alert">{error}</p>}
 </form>;
}
