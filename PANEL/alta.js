const $=q=>document.querySelector(q),files=[],MAX_FILES=12,MAX_MB=25,ENDPOINT="https://ovfmqqqwezfdtgrtkjhf.supabase.co/functions/v1/super-service",ST={sending:false};

const esc=v=>(v??"").toString().replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const digits=v=>(v||"").replace(/\D+/g,"");
const human=n=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
const totalBytes=()=>files.reduce((a,f)=>a+(f.size||0),0);
const setBusy=v=>{ST.sending=!!v;$("#btnSubmit").disabled=ST.sending;$("#btnClear").disabled=ST.sending;$("#fileInput").disabled=ST.sending;$("#dropArea").classList.toggle("is-busy",ST.sending)};
const setMsg=(text,variant="")=>{const el=$("#statusMsg");el.textContent=text;el.className=`status ${variant}`.trim();$("#statePill").textContent=variant==="ok"?"Enviado":variant==="bad"?"Error":variant==="warn"?"Atención":ST.sending?"Enviando":"Listo";$("#miniStatus").textContent=variant==="ok"?"Enviado":variant==="bad"?"Error":variant==="warn"?"Revisar":ST.sending?"Procesando":"En espera"};
const renderMeta=()=>{$("#filesCount").textContent=String(files.length);$("#filesWeight").textContent=human(totalBytes())};
const fileKey=f=>`${f.name}__${f.size}__${f.lastModified||0}`;
const hasFile=f=>files.some(x=>fileKey(x)===fileKey(f));

const renderFiles=()=>{$("#fileList").innerHTML=files.length?files.map((f,i)=>`<div class="file"><div class="file-top"><strong>📄 ${esc(f.name)}</strong><button class="file-del" data-del="${i}" type="button">Quitar</button></div><div class="file-meta">${human(f.size)} · ${esc(f.type||"archivo")}</div></div>`).join(""):""};

const sync=msg=>{renderFiles();renderMeta();if(msg)setMsg(msg);else if(!files.length)setMsg("Listo para recibir tu información.");else setMsg("Archivos listos para enviarse.")};

const addFiles=list=>{let ignored=0,duplicated=0;for(const f of [...list]){if(hasFile(f)){duplicated++;continue}if(files.length>=MAX_FILES){ignored++;continue}if((f.size||0)>MAX_MB*1024*1024){ignored++;continue}files.push(f)}sync(ignored||duplicated?`Se omitieron ${ignored+duplicated} archivo(s) por límite, peso o duplicado.`:"Archivos listos para enviarse.");if(!files.length)setMsg("Listo para recibir tu información.")};

const clearAll=()=>{if(ST.sending)return;$("#altaForm").reset();$("#fileInput").value="";files.length=0;sync("Listo para recibir tu información.")};

const validate=()=>{const nombre=$("#nombre").value.trim(),correo=$("#correo").value.trim(),telefono=digits($("#telefono").value);if(!nombre)return"Falta el nombre o razón social.";if(correo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))return"El correo no parece válido.";if($("#telefono").value.trim()&&telefono.length<10)return"El teléfono parece incompleto.";if(!files.length)return"Debes subir al menos un archivo.";return""};

const buildFormData=()=>{const fd=new FormData();fd.append("nombre",$("#nombre").value.trim());fd.append("telefono",digits($("#telefono").value));fd.append("correo",$("#correo").value.trim());fd.append("contacto",$("#contacto").value.trim());fd.append("comentarios",$("#comentarios").value.trim());files.forEach(f=>fd.append("files",f));return fd};

const renderSuccess=j=>{const nombre=esc($("#nombre").value.trim()),count=files.length;document.querySelector(".panel").innerHTML=`<div class="panel-top"><div><div class="section-kicker">Solicitud enviada</div><h2 class="panel-title">Gracias, ya recibimos tu información</h2><p class="panel-sub">Tu equipo de soporte en Expiriti ya puede revisar tu solicitud y preparar tu cuenta.</p></div><span class="state-pill">Enviado</span></div><div class="status ok">✅ Folio recibido correctamente${j?.solicitud_id?`: ${esc(String(j.solicitud_id))}`:""}.</div><div class="meta-row" style="margin-top:16px"><div class="meta-card"><span class="meta-k">Empresa</span><strong class="meta-v">${nombre}</strong></div><div class="meta-card"><span class="meta-k">Archivos</span><strong class="meta-v">${count}</strong></div><div class="meta-card"><span class="meta-k">Estado</span><strong class="meta-v">Pendiente de revisión</strong></div></div>`};

const readJsonSafe=async r=>{const txt=await r.text();try{return txt?JSON.parse(txt):{}}catch{return{raw:txt}}};

const sendForm=async()=>{const r=await fetch(ENDPOINT,{method:"POST",body:buildFormData()});const j=await readJsonSafe(r);if(!r.ok)throw new Error(j?.error||j?.message||j?.raw||"No se pudo procesar el alta.");return j};

const onDropClick=e=>{if(ST.sending)return;if(e.target.closest("[data-del]"))return;$("#fileInput").click()};
const onFileListClick=e=>{const b=e.target.closest("[data-del]");if(!b||ST.sending)return;files.splice(+b.dataset.del,1);sync()};
const onDragOver=e=>{e.preventDefault();if(!ST.sending)$("#dropArea").classList.add("drag")};
const onDragLeave=()=>$("#dropArea").classList.remove("drag");
const onDrop=e=>{e.preventDefault();$("#dropArea").classList.remove("drag");if(!ST.sending)addFiles(e.dataTransfer.files||[])};

const onSubmit=async e=>{e.preventDefault();if(ST.sending)return;const err=validate();if(err)return setMsg(err,"bad");setBusy(true);setMsg("Procesando solicitud...");try{const j=await sendForm();setMsg("Solicitud enviada correctamente.","ok");renderSuccess(j)}catch(err){setMsg(err.message||"Hubo un error al enviar.","bad");setBusy(false)}};

const bind=()=>{$("#btnClear").addEventListener("click",clearAll);$("#dropArea").addEventListener("click",onDropClick);$("#fileList").addEventListener("click",onFileListClick);$("#fileInput").addEventListener("change",e=>addFiles(e.target.files||[]));$("#dropArea").addEventListener("dragover",onDragOver);$("#dropArea").addEventListener("dragleave",onDragLeave);$("#dropArea").addEventListener("drop",onDrop);$("#altaForm").addEventListener("submit",onSubmit)};

bind();renderMeta();setMsg("Listo para recibir tu información.");
