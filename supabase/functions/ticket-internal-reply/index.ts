import{createClient}from"npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_APP_URL=(Deno.env.get("PUBLIC_APP_URL")||"").replace(/\/+$/,"");
const RESEND_API_KEY=Deno.env.get("RESEND_API_KEY")||"";
const MAIL_FROM=Deno.env.get("MAIL_FROM")||"Expiriti <soporte@expiriti.com.mx>";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY);
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean=(v:unknown,max=3000)=>String(v??"").trim().slice(0,max);
const lower=(v:unknown)=>String(v??"").trim().toLowerCase();
const validMail=(v:unknown)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim());
const htmlSafe=(v:unknown)=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]!)).replace(/\n/g,"<br>");

const trace=(step:string,meta:Record<string,unknown>={})=>console.log("TICKET_INTERNAL_REPLY_TRACE",JSON.stringify({step,...meta,at:new Date().toISOString()}));
async function withTimeout<T>(p:Promise<T>,ms:number,label:string){let h=0;try{return await Promise.race([p,new Promise<T>((_,rej)=>{h=setTimeout(()=>rej(new Error(`${label}_TIMEOUT`)),ms)})])}finally{clearTimeout(h)}}

const replyActionToState=(v:unknown)=>{const x=lower(v||"esperar_cliente").replace(/[\s-]+/g,"_");if(["esperar_cliente","esperando_cliente","wait_client","waiting_client"].includes(x))return"esperando_cliente";if(["seguir_trabajando","en_proceso","proceso","keep_open","seguir"].includes(x))return"en_proceso";if(["resuelto","resolver","solved"].includes(x))return"resuelto";return"esperando_cliente"};

async function sendMail({to,subject,html}:{to:string;subject:string;html:string}){if(!RESEND_API_KEY||!to)return false;const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),4500);try{const r=await fetch("https://api.resend.com/emails",{method:"POST",signal:ac.signal,headers:{Authorization:`Bearer ${RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:MAIL_FROM,to:[to],subject,html})});const txt=await r.text().catch(()=>"");if(!r.ok)throw new Error(`MAIL_ERROR_${r.status}${txt?`: ${txt.slice(0,180)}`:""}`);return true}catch(e){if(e instanceof DOMException&&e.name==="AbortError")throw new Error("MAIL_TIMEOUT");throw e}finally{clearTimeout(timer)}}
async function addTicketEvento(ticket_id:string,autor_tipo:"cliente"|"soporte"|"sistema",visibilidad:"publica"|"interna",kind:"mensaje"|"estado"|"nota"|"archivo"|"sistema"|"asignacion"|"sla",texto:string,meta:Record<string,unknown>={}){const idem=String(meta?.idempotency_key||"");const{data,error}=await sb.from("ticket_eventos").insert({ticket_id,autor_tipo,visibilidad,kind,texto,meta}).select("id").single();if(!error)return data;if(error.code==="23505"&&idem){const old=await sb.from("ticket_eventos").select("id").eq("ticket_id",ticket_id).eq("meta->>idempotency_key",idem).maybeSingle();if(old.data)return old.data}throw new Error(`TICKET_EVENTO_ERROR: ${error.message}`)}
async function bitacora(accion:string,cliente_id:string|null,detalle:Record<string,unknown>){try{await sb.from("bitacora").insert({accion,cliente_id,detalle,visibilidad:"interna",tipo:"nota_interna"})}catch(e){console.error("BITACORA_ERROR",e)}}
const idemClean=(v:unknown)=>clean(v,220).replace(/[^a-zA-Z0-9:_\-.]/g,"").slice(0,220);
const sha256=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))).map(b=>b.toString(16).padStart(2,"0")).join("");

async function idemStart(key:string,action:string,resource_id:string,request_hash:string){if(!key)return{mode:"none"};const now=new Date().toISOString();const ins=await sb.from("edge_idempotency").insert({idempotency_key:key,action,resource_id,request_hash,status:"processing"}).select("*").single();if(!ins.error)return{mode:"new",row:ins.data};if(ins.error.code!=="23505")throw new Error(`IDEMPOTENCY_INSERT_ERROR: ${ins.error.message}`);const old=await sb.from("edge_idempotency").select("*").eq("idempotency_key",key).maybeSingle();if(old.error)throw new Error(`IDEMPOTENCY_READ_ERROR: ${old.error.message}`);if(!old.data)return{mode:"new"};if(old.data.request_hash&&old.data.request_hash!==request_hash)return{mode:"conflict",row:old.data};if(old.data.status==="completed"&&old.data.response)return{mode:"replay",row:old.data};const age=Date.now()-new Date(old.data.updated_at||old.data.created_at||0).getTime();if(old.data.status==="failed"||age>90000){const reset=await sb.from("edge_idempotency").update({status:"processing",error:null,updated_at:now}).eq("idempotency_key",key).select("*").single();if(reset.error)throw new Error(`IDEMPOTENCY_RESET_ERROR: ${reset.error.message}`);return{mode:"retry",row:reset.data}}return{mode:"processing",row:old.data}}
async function idemDone(key:string,response:Record<string,unknown>){if(!key)return;const{error}=await sb.from("edge_idempotency").update({status:"completed",response,error:null,updated_at:new Date().toISOString()}).eq("idempotency_key",key);if(error)console.error("IDEMPOTENCY_DONE_ERROR",error)}
async function idemFail(key:string,errorMsg:string){if(!key)return;const{error}=await sb.from("edge_idempotency").update({status:"failed",error:errorMsg,updated_at:new Date().toISOString()}).eq("idempotency_key",key);if(error)console.error("IDEMPOTENCY_FAIL_ERROR",error)}



Deno.serve(async req=>{
if(req.method==="OPTIONS")return json({ok:true},200);
if(req.method!=="POST")return json({error:"Método no permitido"},405);
let idemKey="";
const startedAt=Date.now();
try{
trace("start",{method:req.method});

const auth=req.headers.get("authorization")||"",jwt=auth.replace(/^Bearer\s+/i,"").trim();
if(!jwt)return json({error:"No autorizado"},401);

trace("auth_before",{hasJwt:!!jwt});
const{data:userRes,error:userErr}=await withTimeout(sb.auth.getUser(jwt),4500,"AUTH_GET_USER");
if(userErr||!userRes?.user)return json({error:"Sesión inválida"},401);
const uid=userRes.user.id;
trace("auth_ok",{uid});

trace("perfil_before",{uid});
const{data:perfil,error:perErr}=await withTimeout(sb.from("perfiles").select("id,rol,nombre").eq("id",uid).maybeSingle(),4500,"PERFIL_QUERY");
if(perErr)return json({error:perErr.message},500);
if(!perfil||!["admin","soporte"].includes(lower(perfil.rol)))return json({error:"Sin permisos"},403);
trace("perfil_ok",{rol:perfil.rol});



const body=await req.json().catch(()=>({}));
const ticket_id=clean(body.ticket_id,80),texto=clean(body.texto,3000),replyAction=clean(body.replyAction||"esperar_cliente",40),source=clean(body.source||"ticket_internal_reply",80),quick_key=clean(body.quick_key||"",80),nextEstado=replyActionToState(replyAction),now=new Date().toISOString();

if(!ticket_id)return json({error:"Falta ticket_id"},400);
if(!texto)return json({error:"Escribe una respuesta"},400);
if(texto.length<3)return json({error:"Respuesta demasiado corta"},400);
if(texto.length>3000)return json({error:"Respuesta demasiado larga"},400);

idemKey=idemClean(body.idempotency_key);
const requestHash=await sha256(JSON.stringify({ticket_id,texto,replyAction,source,quick_key}));

trace("idempotency_before",{ticket_id,hasKey:!!idemKey});
const idem=await withTimeout(idemStart(idemKey,"ticket-internal-reply",ticket_id,requestHash),4500,"IDEMPOTENCY_START");
trace("idempotency_ok",{mode:idem.mode});
if(idem.mode==="replay")return json({...idem.row.response,idempotent_replay:true},200);
if(idem.mode==="conflict")return json({error:"idempotency_key reutilizada con contenido distinto",idempotency_key:idemKey},409);
if(idem.mode==="processing")return json({error:"Solicitud ya está en proceso",idempotency_key:idemKey},409);




trace("ticket_before",{ticket_id});
const{data:t,error:tErr}=await withTimeout(sb.from("tickets").select("id,cliente_id,folio,titulo,estado,timeline_publica,primera_respuesta_en,correo_cliente,correo_capturado,nombre_cliente_contacto,nombre_capturado,empresa_capturada,token_publico,token_publico_expira").eq("id",ticket_id).maybeSingle(),4500,"TICKET_QUERY");
if(tErr)return json({error:tErr.message},500);
if(!t)return json({error:"Ticket no encontrado"},404);
if(lower(t.estado)==="cerrado")return json({error:"El ticket está cerrado"},409);
trace("ticket_ok",{ticket_id:t.id,estado:t.estado,folio:t.folio});


const autor=perfil.nombre||perfil.email||"Soporte";
const to=clean(t.correo_cliente||t.correo_capturado||"",180);
trace("evento_before",{ticket_id:t.id});
const evento=await withTimeout(addTicketEvento(t.id,"soporte","publica","mensaje",texto,{canal:source,folio:t.folio,autor,autor_id:uid,replyAction,quick_key,idempotency_key:idemKey,estado_nuevo:nextEstado}),4500,"TICKET_EVENTO_INSERT");
trace("evento_ok",{evento_id:evento?.id||null});

const timelineActual=Array.isArray(t.timeline_publica)?t.timeline_publica:[];
const yaTimeline=idemKey&&timelineActual.some((x:Record<string,unknown>)=>String(x?.idempotency_key||"")===idemKey);
const entry={kind:"mensaje",autor:"soporte",titulo:"Soporte respondió",texto,fecha:now,idempotency_key:idemKey};
const patch:Record<string,unknown>={estado:nextEstado,fecha_actualizacion:now,timeline_publica:yaTimeline?timelineActual:[...timelineActual,entry]};

if(!t.primera_respuesta_en)patch.primera_respuesta_en=now;
trace("ticket_update_before",{ticket_id:t.id,nextEstado});
const up=await withTimeout(sb.from("tickets").update(patch).eq("id",t.id),4500,"TICKET_UPDATE");
if(up.error)return json({error:up.error.message},500);
trace("ticket_update_ok",{ticket_id:t.id});

await withTimeout(bitacora("respuesta_soporte_ticket",t.cliente_id||null,{ticket_id:t.id,folio:t.folio,evento_id:evento?.id||null,replyAction,estado_nuevo:nextEstado,desde:"tickets_quick_reply"}),2500,"BITACORA").catch(e=>console.error("BITACORA_TIMEOUT_OR_ERROR",e));

let mail_sent=false,mail_error="";
if(validMail(to)&&t.token_publico){
try{
const appUrl=PUBLIC_APP_URL||"https://universalunidad-ux.github.io";
const magic_link=`${appUrl}/estado.html?folio=${encodeURIComponent(String(t.folio||""))}&token=${encodeURIComponent(String(t.token_publico||""))}`;

trace("mail_before",{to:to?to.replace(/^(.{2}).*(@.*)$/,"$1***$2"):""});
mail_sent=await withTimeout(sendMail({to,subject:`Actualización de soporte ${t.folio}`,html:`<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111"><h2 style="margin:0 0 12px">Actualización de tu solicitud de soporte</h2><p style="margin:0 0 10px"><b>Folio:</b> ${htmlSafe(t.folio)}</p><p style="margin:0 0 10px"><b>Título:</b> ${htmlSafe(t.titulo||"Solicitud de soporte")}</p><div style="margin:14px 0;padding:12px 14px;border-radius:12px;background:#f6f7f9;border:1px solid #e5e7eb">${htmlSafe(texto)}</div><p style="margin:0 0 14px"><a href="${magic_link}" style="display:inline-block;padding:10px 14px;border-radius:10px;text-decoration:none;background:#111;color:#fff">Abrir seguimiento</a></p><p style="margin:0;color:#555">Puedes responder desde ese mismo enlace si necesitas agregar información, XML, capturas o archivos.</p></div>`}),5000,"MAIL_SEND");
trace("mail_ok",{sent:mail_sent});
}catch(e){
mail_error=e instanceof Error?e.message:String(e);
await withTimeout(bitacora("respuesta_soporte_mail_error",t.cliente_id||null,{ticket_id:t.id,folio:t.folio,to,error:mail_error}),2500,"BITACORA_MAIL_ERROR").catch(e=>console.error("BITACORA_MAIL_ERROR_TIMEOUT_OR_ERROR",e));
}
}else{
mail_error=!to?"sin_correo_destino":"correo_invalido_o_sin_token";
await withTimeout(bitacora("respuesta_soporte_sin_mail",t.cliente_id||null,{ticket_id:t.id,folio:t.folio,to,reason:mail_error}),2500,"BITACORA_SIN_MAIL").catch(e=>console.error("BITACORA_SIN_MAIL_TIMEOUT_OR_ERROR",e));
}

const responseBody={ok:true,ticket_id:t.id,folio:t.folio,estado:nextEstado,evento_id:evento?.id||null,mail_sent,mail_error,primera_respuesta_en:patch.primera_respuesta_en||t.primera_respuesta_en||null,idempotency_key:idemKey};
await withTimeout(idemDone(idemKey,responseBody),2500,"IDEMPOTENCY_DONE").catch(e=>console.error("IDEMPOTENCY_DONE_TIMEOUT_OR_ERROR",e));
trace("done",{ticket_id:t.id,ms:Date.now()-startedAt,mail_sent});
return json(responseBody,200);


}catch(err){
const m=err instanceof Error?err.message:"Error";
await idemFail(idemKey,m);
console.error("TICKET_INTERNAL_REPLY_FATAL",err);
return json({error:m,idempotency_key:idemKey||null},500);
}
});
