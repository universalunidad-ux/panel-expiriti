const $=q=>document.querySelector(q);
const files=[];
const MAX_FILES=12;
const MAX_MB=25;
const ENDPOINT="https://ovfmqqqwezfdtgrtkjhf.supabase.co/functions/v1/super-service";

const setMsg=(text,variant="")=>{
  const el=$("#statusMsg");
  el.textContent=text;
  el.className=`status ${variant}`.trim();
  $("#statePill").textContent=variant==="ok"?"Enviado":variant==="bad"?"Error":variant==="warn"?"Atención":"Listo";
  $("#miniStatus").textContent=variant==="ok"?"Enviado":variant==="bad"?"Error":variant==="warn"?"Revisar":"En espera";
};

const human=n=>{
  if(n>=1024*1024)return`${(n/1024/1024).toFixed(1)} MB`;
  return`${Math.max(1,Math.round(n/1024))} KB`;
};

const totalBytes=()=>files.reduce((a,f)=>a+(f.size||0),0);

const renderMeta=()=>{
  $("#filesCount").textContent=String(files.length);
  $("#filesWeight").textContent=human(totalBytes());
};

const renderFiles=()=>{
  $("#fileList").innerHTML=files.length?files.map((f,i)=>`
    <div class="file">
      <div class="file-top">
        <strong>📄 ${f.name}</strong>
        <button class="file-del" data-del="${i}" type="button">Quitar</button>
      </div>
      <div class="file-meta">${human(f.size)} · ${f.type||"archivo"}</div>
    </div>
  `).join(""):"";
  document.querySelectorAll("[data-del]").forEach(b=>b.onclick=e=>{
    files.splice(+e.currentTarget.dataset.del,1);
    renderFiles();
    renderMeta();
    if(!files.length)setMsg("Listo para recibir tu información.");
  });
};

const addFiles=list=>{
  let ignored=0;
  for(const f of [...list]){
    if(files.length>=MAX_FILES){ignored++;continue}
    if(f.size>MAX_MB*1024*1024){ignored++;continue}
    files.push(f);
  }
  renderFiles();
  renderMeta();
  if(ignored)setMsg(`Se omitieron ${ignored} archivo(s) por límite de cantidad o peso.`,"warn");
  else if(files.length)setMsg("Archivos listos para enviarse.");
};

const clearAll=()=>{
  $("#altaForm").reset();
  $("#fileInput").value="";
  files.length=0;
  renderFiles();
  renderMeta();
  setMsg("Listo para recibir tu información.");
};

const validate=()=>{
  const nombre=$("#nombre").value.trim();
  const correo=$("#correo").value.trim();
  if(!nombre)return"Falta el nombre o razón social.";
  if(correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))return"El correo no parece válido.";
  if(!files.length)return"Debes subir al menos un archivo.";
  return"";
};

$("#btnClear").onclick=clearAll;

$("#dropArea").onclick=e=>{
  if(e.target.dataset.del!=null)return;
  $("#fileInput").click();
};

$("#fileInput").onchange=e=>addFiles(e.target.files||[]);

$("#dropArea").ondragover=e=>{
  e.preventDefault();
  $("#dropArea").classList.add("drag");
};

$("#dropArea").ondragleave=()=>{
  $("#dropArea").classList.remove("drag");
};

$("#dropArea").ondrop=e=>{
  e.preventDefault();
  $("#dropArea").classList.remove("drag");
  addFiles(e.dataTransfer.files||[]);
};

$("#altaForm").onsubmit=async e=>{
  e.preventDefault();

  const err=validate();
  if(err)return setMsg(err,"bad");

  const btn=$("#btnSubmit");
  btn.disabled=true;
  setMsg("Procesando solicitud...");

  try{
    const fd=new FormData();
    fd.append("nombre",$("#nombre").value.trim());
    fd.append("telefono",$("#telefono").value.trim());
    fd.append("correo",$("#correo").value.trim());
    fd.append("contacto",$("#contacto").value.trim());
    fd.append("comentarios",$("#comentarios").value.trim());
    files.forEach(f=>fd.append("files",f));

    const r=await fetch(ENDPOINT,{method:"POST",body:fd});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||"No se pudo procesar el alta.");

    document.querySelector(".panel").innerHTML=`
      <div class="panel-top">
        <div>
          <div class="section-kicker">Solicitud enviada</div>
          <h2 class="panel-title">Gracias, ya recibimos tu información</h2>
          <p class="panel-sub">Tu equipo de soporte en Expiriti ya puede revisar tu solicitud y preparar tu cuenta.</p>
        </div>
        <span class="state-pill">Enviado</span>
      </div>
      <div class="status ok">✅ Folio recibido correctamente${j.solicitud_id?`: ${j.solicitud_id}`:""}.</div>
      <div class="meta-row" style="margin-top:16px">
        <div class="meta-card"><span class="meta-k">Empresa</span><strong class="meta-v">${$("#nombre").value.trim()}</strong></div>
        <div class="meta-card"><span class="meta-k">Archivos</span><strong class="meta-v">${files.length}</strong></div>
        <div class="meta-card"><span class="meta-k">Estado</span><strong class="meta-v">Pendiente de revisión</strong></div>
      </div>
    `;
  }catch(err){
    setMsg(err.message||"Hubo un error al enviar.","bad");
    btn.disabled=false;
  }
};

renderMeta();
setMsg("Listo para recibir tu información.");
