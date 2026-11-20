'use client';
import { useEffect, useState } from 'react';
import { contactLabel } from '@/lib/contact-search';

type Result={id:string;alias:string;display_name:string|null;instagram_handle:string|null;source:string;created_at:string;inquiry_count:number;sale_count:number;has_payment:boolean};
export function ContactPicker({orgId,value,onChange,label='Cliente'}:{orgId:string;value:string;onChange:(id:string)=>void;label?:string}){
 const [query,setQuery]=useState(''),[rows,setRows]=useState<Result[]>([]),[open,setOpen]=useState(false),[pending,setPending]=useState(false);
 useEffect(()=>{if(!open)return;const controller=new AbortController();const timer=setTimeout(()=>{
  setPending(true);fetch(`/api/data?table=contact_search&orgId=${encodeURIComponent(orgId)}&q=${encodeURIComponent(query)}`,{signal:controller.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok)throw new Error('Búsqueda no disponible');return r.json()}).then(data=>setRows(data.rows||[])).catch(e=>{if(e.name!=='AbortError')setRows([])}).finally(()=>setPending(false));
 },query?120:0);return()=>{clearTimeout(timer);controller.abort()};},[orgId,query,open]);
 const selected=rows.find(x=>x.id===value);
 const status=(r:Result)=>r.has_payment?'Ya cobró':r.sale_count?'Con venta':'Sin venta';
 const groups=['Sin venta','Con venta','Ya cobró'] as const;
 return <div className="field picker"><label htmlFor="contact-picker">{label}</label>
  <input id="contact-picker" role="combobox" aria-expanded={open} aria-controls="contact-results" aria-autocomplete="list" autoComplete="off"
   placeholder="Alias, nombre o @Instagram" value={open?query:selected?contactLabel(selected):query}
   onFocus={()=>{setOpen(true);setQuery('')}} onChange={e=>{setQuery(e.target.value);onChange('');setOpen(true)}}
   onKeyDown={e=>{if(e.key==='Escape')setOpen(false);if(e.key==='Enter'&&open&&rows[0]){e.preventDefault();onChange(rows[0].id);setOpen(false)}}}/>
  {value&&!open&&<button type="button" className="secondary small" onClick={()=>{onChange('');setQuery('');setOpen(true)}}>Cambiar cliente</button>}
  {open&&<div id="contact-results" role="listbox" className="pickerResults"><div className="help">{query?'Resultados':'10 clientes recientes'}{pending?' · Buscando…':''}</div>
   {groups.map(group=>rows.some(r=>status(r)===group)&&<div key={group}><div className="pickerGroup">{group}</div>{rows.filter(r=>status(r)===group).map(r=><button type="button" role="option" aria-selected={r.id===value} key={r.id} className="pickerOption" onClick={()=>{onChange(r.id);setQuery(contactLabel(r));setOpen(false)}}>
    <strong>{r.alias}{r.instagram_handle?` · @${r.instagram_handle}`:''}</strong><span className="sub">{r.source} · {new Date(r.created_at).toLocaleDateString('es-UY')} · {r.inquiry_count} consultas · #{r.id.slice(0,8)}</span>
   </button>)}</div>)}{!pending&&!rows.length&&<p className="help">No hay coincidencias. Podés registrar una consulta sin identidad y vincularla después.</p>}
  </div>}
 </div>;
}
