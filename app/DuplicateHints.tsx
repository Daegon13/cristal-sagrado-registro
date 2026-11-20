'use client';
import { useEffect, useState } from 'react';
import { fold } from '@/lib/contact-search';
type Match={id:string;alias:string;instagram_handle:string|null;inquiry_count:number;sale_count:number};
export function DuplicateHints({orgId,query,excludeId,onSelect}:{orgId:string;query:string;excludeId?:string;onSelect:(id:string)=>void}){
 const [rows,setRows]=useState<Match[]>([]);
 useEffect(()=>{const term=fold(query);if(term.length<3){setRows([]);return}const ctrl=new AbortController();const timer=setTimeout(()=>{
  fetch(`/api/data?table=contact_search&orgId=${encodeURIComponent(orgId)}&q=${encodeURIComponent(term)}`,{cache:'no-store',signal:ctrl.signal}).then(r=>r.ok?r.json():{rows:[]}).then(x=>setRows((x.rows||[]).filter((r:Match)=>r.id!==excludeId))).catch(()=>{});
 },180);return()=>{clearTimeout(timer);ctrl.abort()};},[orgId,query,excludeId]);
 if(!rows.length)return null;
 return <div className="notice"><strong>Posibles duplicados · revisar</strong>{rows.slice(0,5).map(r=><div className="quickRow" key={r.id}><span>{r.alias}{r.instagram_handle?` · @${r.instagram_handle}`:''} · {r.inquiry_count} consultas · {r.sale_count} ventas</span><button type="button" className="secondary tiny" onClick={()=>onSelect(r.id)}>Usar este cliente</button></div>)}<p className="help">La app nunca fusiona clientes por coincidencia de texto.</p></div>;
}
