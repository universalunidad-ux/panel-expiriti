import{createClient as C}from"https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import{$,toast}from"./global.js";

const s=C("https://ovfmqqqwezfdtgrtkjhf.supabase.co","TU_ANON_KEY");

async function load(){
  const{data,error}=await s.from("solicitudes_alta").select("*").order("creado_en",{ascending:false});
  if(error)return toast(error.message,"err");
  render(data||[]);
}

function render(rows){
  $("#list").innerHTML=rows.map(r=>`
    <div class="card">
      <strong>${r.nombre}</strong>
      <div class="mut">${r.correo||"-"}</div>
      <div class="mut">${r.estatus}</div>
      <button class="btn" data-id="${r.id}">Aprobar</button>
    </div>
  `).join("");

  document.querySelectorAll("[data-id]").forEach(b=>{
    b.onclick=()=>approve(b.dataset.id);
  });
}

async function approve(id){
  if(!confirm("Crear cliente?"))return;

  const{data}=await s.from("solicitudes_alta").select("*").eq("id",id).single();

  const{data:c,error}=await s.from("clientes").insert({
    nombre:data.nombre,
    correo:data.correo,
    telefono:data.telefono
  }).select().single();

  if(error)return toast(error.message,"err");

  await s.from("solicitudes_alta").update({
    estatus:"aprobada",
    cliente_id:c.id
  }).eq("id",id);

  toast("Cliente creado","ok");
  load();
}

load();
