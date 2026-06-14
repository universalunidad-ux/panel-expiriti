import{createClient}from"npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_APP_URL=(Deno.env.get("PUBLIC_APP_URL")||"").replace(/\/+$/,"");
const RESEND_API_KEY=Deno.env.get("RESEND_API_KEY")||"";
const MAIL_FROM=Deno.env.get("MAIL_FROM")||"Expiriti <soporte@expiriti.com.mx>";
const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY);
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean=(v:unknown,max=3000)=>String(v??"").trim().replace(/\s+/g," ").slice(0,max);
const lower=(v:unknown)=>String(v??"").trim().toLowerCase();
const validMail=(v:unknown)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim());
const htmlSafe=(v:unknown)=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]!)).replace(/\n/g,"<br>");
const randToken=()=>crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
const getNextFolio=async(prefix="EX")=>{const{data,error}=await sb.rpc("next_ticket_folio",{p_prefix:prefix});if(error)throw new Error(`FOLIO_RPC_ERROR: ${error.message}`);const folio=String(data||"").trim();if(!folio)throw new Error("FOLIO_EMPTY");return folio};
const slaPack=(prioridad:string)=>{const p=lower(prioridad||"media"),now=Date.now();if(p==="urgente")return{sla_policy:"urgent_2h_8h",sla_first_response_deadline:new Date(now+2*60*60*1000).toISOString(),sla_resolution_deadline:new Date(now+8*60*60*1000).toISOString()};if(p==="alta")return{sla_policy:"high_4h_24h",sla_first_response_deadline:new Date(now+4*60*60*1000).toISOString(),sla_resolution_deadline:new Date(now+24*60*60*1000).toISOString()};if(p==="media")return{sla_policy:"medium_8h_48h",sla_first_response_deadline:new Date(now+8*60*60*1000).toISOString(),sla_resolution_deadline:new Date(now+48*60*60*1000).toISOString()};return{sla_policy:"low_24h_72h",sla_first_response_deadline:new Date(now+24*60*60*1000).toISOString(),sla_resolution_deadline:new Date(now+72*60*60*1000).toISOString()}};
async function sendMail({to,subject,html}:{to:string;subject:string;html:string}){if(!RESEND_API_KEY||!to)return false;const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:MAIL_FROM,to:[to],subject,html})});if(!r.ok)throw new Error(`MAIL_ERROR_${r.status}`);return true}
async function addEvento(ticket_id:string,uid:string,autor_tipo:"cliente"|"soporte"|"sistema",visibilidad:"publica"|"interna",kind:"mensaje"|"estado"|"nota"|"archivo"|"sistema"|"asignacion"|"sla",texto:string,meta:Record<string,unknown>={}){const{error}=await sb.from("ticket_eventos").insert({ticket_id,created_by:uid,autor_tipo,visibilidad,kind,texto,meta});if(error)throw new Error(`TICKET_EVENTO_ERROR: ${error.message}`)}

async function bitacora(usuario_id:string,accion:string,cliente_id:string|null,detalle:Record<string,unknown>){try{await sb.from("bitacora").insert({usuario_id,accion,cliente_id,detalle,visibilidad:"interna",tipo:"nota_interna"})}catch(e){console.error("BITACORA_ERROR",e)}}

Deno.serve(async req=>{
if(req.method==="OPTIONS")return json({ok:true});
if(req.method!=="POST")return json({error:"Método no permitido"},405);
try{
const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
if(!jwt)return json({error:"No autorizado"},401);

const{data:userRes,error:userErr}=await sb.auth.getUser(jwt);
if(userErr||!userRes?.user)return json({error:"Sesión inválida"},401);
const uid=userRes.user.id;

const{data:perfil,error:perErr}=await sb.from("perfiles").select("id,rol").eq("id",uid).maybeSingle();

if(perErr)return json({error:perErr.message},500);
if(!perfil||!["admin","soporte"].includes(lower(perfil.rol)))return json({error:"Sin permisos"},403);

const b=await req.json().catch(()=>({}));
let cliente_id:string|null=clean(b.cliente_id,80)||null;
let contacto_id:string|null=clean(b.contacto_id,80)||null;
const empresa=clean(b.empresa,160);
const nombre=clean(b.nombre,140);
const correo=clean(b.correo,180);
const telefono=clean(b.telefono,40);
const titulo=clean(b.titulo,140);
const descripcion=clean(b.descripcion,3000);
const sistema=clean(b.sistema,140);
const prioridad=clean(b.prioridad||"media",20);
const tipo=clean(b.tipo||"soporte",40);
const notificar=b.notificar!==false;
const now=new Date().toISOString();

if(!titulo)return json({error:"Falta título"},400);
if(titulo.length<6)return json({error:"Título demasiado corto"},400);
if(!descripcion||descripcion.length<8)return json({error:"Describe un poco más el caso"},400);
if(notificar&&!validMail(correo))return json({error:"Para notificar al cliente necesitas un correo válido"},400);
if(contacto_id){const{data:ct,error:ctErr}=await sb.from("clientes_contactos").select("id,cliente_id,nombre,correo,telefono,activo").eq("id",contacto_id).maybeSingle();if(ctErr)throw new Error(`CONTACTO_LOOKUP_ERROR: ${ctErr.message}`);if(!ct)return json({error:"Contacto no encontrado"},400);if(ct.activo===false)return json({error:"Contacto inactivo"},400);if(cliente_id&&ct.cliente_id!==cliente_id)return json({error:"El contacto no pertenece al cliente seleccionado"},400);if(!cliente_id)cliente_id=ct.cliente_id}
if(cliente_id){const{data:cl,error:clErr}=await sb.from("clientes").select("id,nombre").eq("id",cliente_id).maybeSingle();if(clErr)throw new Error(`CLIENTE_LOOKUP_ERROR: ${clErr.message}`);if(!cl)return json({error:"Cliente no encontrado"},400)}
const requiere_consolidacion=!!((!cliente_id&&(empresa||nombre||correo||telefono))||(cliente_id&&!contacto_id&&(nombre||correo||telefono)));
const matchNivelInterno=cliente_id?(contacto_id?"alto":"medio"):(requiere_consolidacion?"medio":null);

const folio=await getNextFolio("IN");
const token_publico=randToken();
const token_publico_expira=new Date(Date.now()+1000*60*60*24*30).toISOString();
const sla=slaPack(prioridad);
const autor="Soporte";

const timeline_publica=[{kind:"mensaje",autor:"soporte",titulo:"Ticket registrado",texto:"Su caso fue registrado por nuestro equipo de soporte y ya quedó disponible para seguimiento.",fecha:now}];

const payload:any={cliente_id,titulo,descripcion,prioridad,estado:"abierto",tipo,origen:"tickets",folio,token_publico,token_publico_expira,timeline_publica,adjuntos:[],evidencia_count:0,fecha_actualizacion:now,correo_cliente:correo||null,correo_capturado:correo||null,nombre_cliente_contacto:nombre||null,nombre_capturado:nombre||null,empresa_capturada:empresa||null,telefono_capturado:telefono||null,contacto_id,cliente_id_sugerido:cliente_id||null,contacto_id_sugerido:contacto_id||null,match_nivel:matchNivelInterno,match_score:cliente_id?100:null,match_confirmado:!!cliente_id,contacto_confirmado:!!contacto_id,contacto_es_nuevo:!contacto_id&&!!(nombre||correo||telefono),requiere_consolidacion,contexto_adicional:sistema?`Sistema: ${sistema}`:null,sla_policy:sla.sla_policy,sla_first_response_deadline:sla.sla_first_response_deadline,sla_resolution_deadline:sla.sla_resolution_deadline,sla_breached_first_response:false,sla_breached_resolution:false};

const{data:ticket,error:tErr}=await sb.from("tickets").insert(payload).select("id,folio,token_publico").single();
if(requiere_consolidacion){const dec=await sb.from("ticket_match_decisiones").insert({ticket_id:ticket.id,empresa_capturada:empresa||null,nombre_capturado:nombre||null,correo_capturado:correo||null,telefono_capturado:telefono||null,cliente_id_sugerido:cliente_id||null,contacto_id_sugerido:contacto_id||null,score:cliente_id?100:null,nivel:matchNivelInterno||"ninguno",razones:["creacion_interna_requiere_consolidacion"],decision:"pendiente"});if(dec.error)console.error("TICKET_MATCH_DECISION_INTERNO_ERROR",dec.error.message)}

await addEvento(ticket.id,uid,"soporte","publica","sistema","Su caso fue registrado por nuestro equipo de soporte y ya quedó disponible para seguimiento.",{origen:"tickets",folio,autor,autor_id:uid,sistema:sistema||null});
await bitacora(uid,"ticket_creado_interno",cliente_id,{ticket_id:ticket.id,folio,notificar,autor_id:uid,autor,cliente_id,contacto_id,requiere_consolidacion,match_nivel:matchNivelInterno,empresa_capturada:empresa||null,nombre_capturado:nombre||null});

let mail_sent=false,mail_error="";
if(notificar&&validMail(correo)){
try{
const appUrl=PUBLIC_APP_URL||"https://universalunidad-ux.github.io";
const magic_link=`${appUrl}/estado.html?folio=${encodeURIComponent(folio)}&token=${encodeURIComponent(token_publico)}`;
mail_sent=await sendMail({to:correo,subject:`Ticket de soporte ${folio}`,html:`<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111"><h2 style="margin:0 0 12px">Se registró su ticket de soporte</h2><p style="margin:0 0 10px"><b>Folio:</b> ${htmlSafe(folio)}</p><p style="margin:0 0 10px"><b>Título:</b> ${htmlSafe(titulo)}</p>${sistema?`<p style="margin:0 0 10px"><b>Sistema:</b> ${htmlSafe(sistema)}</p>`:""}<p style="margin:0 0 10px">Nuestro equipo registró este caso para darle seguimiento.</p><p style="margin:0 0 14px"><a href="${magic_link}" style="display:inline-block;padding:10px 14px;border-radius:10px;text-decoration:none;background:#111;color:#fff">Abrir seguimiento</a></p><p style="margin:0;color:#555">Desde ese enlace podrá revisar avances o agregar información si se solicita.</p></div>`});
}catch(e){
mail_error=e instanceof Error?e.message:String(e);
await bitacora(uid,"ticket_creado_interno_mail_error",cliente_id,{ticket_id:ticket.id,folio,correo,error:mail_error});}
}

return json({ok:true,ticket_id:ticket.id,folio,token_publico,token_publico_expira,mail_sent,mail_error});
}catch(e){
console.error("CREAR_TICKET_INTERNO_FATAL",e);
return json({error:e instanceof Error?e.message:"Error"},500);
}
});