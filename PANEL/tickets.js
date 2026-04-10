import{supabase as s,guardSession,msg}from"./supabase.js";import{$,$$,toast,norm}from"./global.js";

let TK=[],VIEW="kanban";

const stateKey=v=>{const x=norm(v);return x==="en proceso"?"proceso":x==="esperando cliente"?"espera":x==="resuelto"?"resuelto":"nuevo"};

const load=async()=>{await guardSession("index.html");const {data,error}=await s.from("tickets").select("*,clientes(nombre)").order("fecha_creacion",{ascending:false});if(error)return toast(msg(error),"bad");TK=data||[];render()};

const metrics=()=>{const now=new Date(),today=now.toDateString();$("#mUrgent").textContent=TK.filter(x=>norm(x.prioridad)==="urgente"&&stateKey(x.estado)!=="resuelto").length;$("#mWait").textContent=TK.filter(x=>stateKey(x.estado)==="espera").length;$("#mSolved").textContent=TK.filter(x=>stateKey(x.estado)==="resuelto"&&new Date(x.fecha_actualizacion||x.fecha_creacion).toDateString()===today).length;$("#mStale").textContent=TK.filter(x=>stateKey(x.estado)!=="resuelto"&&new Date(x.fecha_actualizacion||x.fecha_creacion).toDateString()!==today).length};

const card=t=>`<div class="k-card" data-id="${t.id}"><div class="k-title">${t.titulo||"Sin título"}</div><div class="k-tags"><span class="tag">${t.prioridad||"—"}</span><span class="tag">${t.estado||"—"}</span></div><div class="k-meta"><span>${t.clientes?.nombre||"—"}</span><span>${t.tipo||"—"}</span></div></div>`;

const paint=()=>{["nuevo","proceso","espera","resuelto"].forEach(k=>$("#col-"+k).innerHTML="");TK.forEach(t=>{const k=stateKey(t.estado);$("#col-"+k).insertAdjacentHTML("beforeend",card(t))});$("#count-nuevo").textContent=$("#col-nuevo").children.length;$("#count-proceso").textContent=$("#col-proceso").children.length;$("#count-espera").textContent=$("#col-espera").children.length;$("#count-resuelto").textContent=$("#col-resuelto").children.length};

const preview=t=>{$("#pvTitle").textContent=t.titulo||"—";$("#pvClient").textContent=t.clientes?.nombre||"—";$("#pvSystem").textContent=t.tipo||"—";$("#pvState").textContent=t.estado||"—";$("#pvPriority").textContent=t.prioridad||"—";$("#pvDesc").textContent=t.descripcion||"Sin descripción";$("#pvOpen").href=`ticket.html?id=${t.id}`};

const bind=()=>{$$(".k-card").forEach(c=>c.onclick=()=>{const t=TK.find(x=>x.id==c.dataset.id);if(t)preview(t)});$("#tkRefresh").onclick=load;$("#tkViewBtn").onclick=()=>{$("#tkBoard").classList.toggle("hidden");$("#tkCompact").classList.toggle("hidden")};$("#tkSave").onclick=async()=>{const titulo=$("#tkTitulo").value.trim(),desc=$("#tkDesc").value.trim();if(!titulo)return;const {error}=await s.from("tickets").insert({titulo,descripcion:desc,estado:"nuevo",prioridad:$("#tkPrioridad").value,tipo:$("#tkTipo").value});if(error)return toast(msg(error),"bad");toast("Ticket creado","ok");$("#tkModal").hidden=true;load()};$("#tkNewBtn").onclick=()=>$("#tkModal").hidden=false;$("#tkClose").onclick=()=>$("#tkModal").hidden=true;$("#tkCancel").onclick=()=>$("#tkModal").hidden=true};

const render=()=>{metrics();paint();bind()};

document.addEventListener("DOMContentLoaded",()=>load());
