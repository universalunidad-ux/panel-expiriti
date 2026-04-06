import{supabase as s,guardSession,logAction,msg}from"./supabase.js";import{$,$$,toast,show,hide,esc}from"./global.js";

let CLIENT_ID=new URLSearchParams(location.search).get("id"),CLIENT={},DOCS=[],TICKETS=[],PROFILE={};

const load=async()=>{const gs=await guardSession("index.html");if(!gs)return;PROFILE=gs.user;
const[c,d,t]=await Promise.all([s.from("clientes").select("*").eq("id",CLIENT_ID).single(),s.from("documentos").select("*").eq("cliente_id",CLIENT_ID),s.from("tickets").select("*").eq("cliente_id",CLIENT_ID)]);
CLIENT=c.data||{};DOCS=d.data||[];TICKETS=t.data||[];render()};

const sem=f=>!f?"":(d=>d<0?"bad":d<=30?"warn":"ok")(Math.ceil((new Date(f)-Date.now())/864e5));

const render=()=>{$("#clienteNombre").textContent=CLIENT.nombre||"Cliente";$("#mDocs").textContent=DOCS.length;$("#mBad").textContent=DOCS.filter(x=>sem(x.fin_vigencia)=="bad").length;$("#mTickets").textContent=TICKETS.length;
if(TICKETS.filter(x=>Date.now()-new Date(x.fecha_creacion)<604800000).length>3)$("#badgeCritico").classList.remove("hidden");

$("#docsList").innerHTML=DOCS.map(d=>`<div class="item">${esc(d.nombre_archivo)}</div>`).join("")||"";
$("#bitList").innerHTML=TICKETS.map(t=>`<div class="item">${esc(t.titulo)}</div>`).join("")||""};

const bindTabs=()=>$$(".tab").forEach(b=>b.onclick=()=>{$$(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$$(".tab-panel").forEach(p=>p.classList.add("hidden"));$("#panel-"+b.dataset.tab).classList.remove("hidden")});

const openTicket=()=>show("#ticketDrawer"),closeTicket=()=>hide("#ticketDrawer");

const saveTicket=async()=>{const titulo=$("#tTitulo").value.trim(),descripcion=$("#tDesc").value.trim();if(!titulo)return;
const {error}=await s.from("tickets").insert({cliente_id:CLIENT_ID,titulo,descripcion,estado:"nuevo",fecha_creacion:new Date().toISOString()});
if(error)return toast(msg(error),"bad");toast("Ticket creado","ok");closeTicket();load()};

const accKey=()=>`acc_${CLIENT_ID}`,loadAcc=()=>{let d={};try{d=JSON.parse(localStorage.getItem(accKey())||"{}")}catch{};$("#accUser").value=d.u||"";$("#accPass").value=d.p||"";$("#accVps").value=d.v||"";$("#accAny").value=d.a||""},
saveAcc=()=>{const d={u:$("#accUser").value,p:$("#accPass").value,v:$("#accVps").value,a:$("#accAny").value};localStorage.setItem(accKey(),JSON.stringify(d));$("#accStatus").textContent="Guardado";logAction({accion:"accesos",cliente_id:CLIENT_ID})},
copy=v=>navigator.clipboard.writeText($(v).value||"");

const bind=()=>{bindTabs();$("#openTicketBtn").onclick=openTicket;$("#saveTicket").onclick=saveTicket;
$("#saveAccBtn").onclick=saveAcc;$("#copyUser").onclick=()=>copy("#accUser");$("#copyPass").onclick=()=>copy("#accPass")};

document.addEventListener("DOMContentLoaded",()=>{bind();load();loadAcc()});
