export function fold(value:string){
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-UY').trim().replace(/^@/,'');
}
export function normalizeHandle(value:string){
 const handle=fold(value);
 return /^[a-z0-9._]{1,30}$/.test(handle)?handle:null;
}
export function contactLabel(contact:{alias:string;instagram_handle?:string|null;id:string}){
 return `${contact.alias}${contact.instagram_handle?` · @${contact.instagram_handle}`:''} · #${contact.id.slice(0,8)}`;
}
