export function sameOrigin(request:Request):boolean{
 const origin=request.headers.get('origin');
 if(!origin)return false;
 try{return new URL(origin).host===new URL(request.url).host && new URL(origin).protocol===new URL(request.url).protocol;}catch{return false;}
}
