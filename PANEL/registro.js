const $=q=>document.querySelector(q),ST={sending:false};
const ENDPOINT="https://ovfmqqqwezfdtgrtkjhf.supabase.co/functions/v1/submit-registro";
const esc=v=>(v??"").toString().replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const digits=v=>(v||"").replace(/\D+/g,"");
const mailOk=v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const setBusy=v=>{ST.sending=!!v;$("#btnSubmit").disabled=ST.sending;$("#btnClear").disabled=ST.sending};
const setMsg=(text,variant="")=>{const el=$("#statusMsg");el.textContent=text;el.className=`status ${variant}`.trim();$("#statePill").textContent=variant==="ok"?"Enviado":variant==="bad"?"Error":variant==="warn"?"Atención":ST.sending?"Enviando":"Listo"};
const clearAll=()=>{if(ST.sending)return;$("#registroForm").reset();setMsg("Listo para registrar tu información.")};

const validate=()=>{
  const empresa=$("#empresa").value.trim(),correoEmpresa=$("#correoEmpresa").value.trim(),telefonoEmpresa=digits($("#telefonoEmpresa").value),contactoNombre=$("#contactoNombre").value.trim(),contactoCorreo=$("#contactoCorreo").value.trim(),contactoTelefono=digits($("#contactoTelefono").value),contactoWhatsapp=digits($("#contactoWhatsapp").value),contactoAltCorreo=$("#contactoAltCorreo").value.trim(),contactoAltTelefono=digits($("#contactoAltTelefono").value),accept=$("#acceptData").checked;
  if(!empresa)return"Falta la razón social o nombre comercial.";
  if(correoEmpresa&&!mailOk(correoEmpresa))return"El correo principal empresa no parece válido.";
  if($("#telefonoEmpresa").value.trim()&&telefonoEmpresa.length<10)return"El teléfono principal empresa parece incompleto.";
  if(!contactoNombre)return"Falta el nombre del contacto principal.";
  if(contactoCorreo&&!mailOk(contactoCorreo))return"El correo del contacto principal no parece válido.";
  if($("#contactoTelefono").value.trim()&&contactoTelefono.length<10)return"El teléfono del contacto principal parece incompleto.";
  if($("#contactoWhatsapp").value.trim()&&contactoWhatsapp.length<10)return"El WhatsApp del contacto principal parece incompleto.";
  if(contactoAltCorreo&&!mailOk(contactoAltCorreo))return"El correo del contacto alterno no parece válido.";
  if($("#contactoAltTelefono").value.trim()&&contactoAltTelefono.length<10)return"El teléfono del contacto alterno parece incompleto.";
  if(!accept)return"Debes confirmar el tratamiento de datos para continuar.";
  return"";
};

const buildFormData=()=>{
  const fd=new FormData();
  fd.append("empresa",$("#empresa").value.trim());
  fd.append("correo_empresa",$("#correoEmpresa").value.trim());
  fd.append("telefono_empresa",digits($("#telefonoEmpresa").value));
  fd.append("contacto_nombre",$("#contactoNombre").value.trim());
  fd.append("contacto_puesto",$("#contactoPuesto").value.trim());
  fd.append("contacto_correo",$("#contactoCorreo").value.trim());
  fd.append("contacto_telefono",digits($("#contactoTelefono").value));
  fd.append("contacto_whatsapp",digits($("#contactoWhatsapp").value));
  fd.append("metodo_contacto_preferido",$("#metodoContacto").value);
  fd.append("horario_contacto",$("#horarioContacto").value.trim());
  fd.append("cumpleanos_contacto",$("#cumpleanos").value);
  fd.append("contacto_alterno_nombre",$("#contactoAltNombre").value.trim());
  fd.append("contacto_alterno_correo",$("#contactoAltCorreo").value.trim());
  fd.append("contacto_alterno_telefono",digits($("#contactoAltTelefono").value));
  fd.append("comentarios",$("#comentarios").value.trim());
  fd.append("origen","registro_publico");
  return fd;
};

const readJsonSafe=async r=>{const txt=await r.text();try{return txt?JSON.parse(txt):{}}catch{return{raw:txt}}};

const renderSuccess=j=>{
  const empresa=esc($("#empresa").value.trim()),contacto=esc($("#contactoNombre").value.trim());
  document.querySelector(".panel").innerHTML=`<div class="panel-top"><div><div class="section-kicker">Registro enviado</div><h2 class="panel-title">Gracias, ya recibimos tus datos</h2><p class="panel-sub">Tu información quedó enviada para validación y consolidación en tu expediente con Expiriti.</p></div><span class="state-pill">Enviado</span></div><div class="status ok">✅ Registro recibido correctamente${j?.solicitud_id?`: ${esc(String(j.solicitud_id))}`:""}.</div><div class="grid" style="margin-top:16px"><div class="field"><span>Empresa</span><div class="input" style="display:flex;align-items:center">${empresa}</div></div><div class="field"><span>Contacto principal</span><div class="input" style="display:flex;align-items:center">${contacto||"Registrado"}</div></div></div><div class="foot-note">Si ya existías en nuestra base, actualizaremos tus datos. Si no, prepararemos tu registro para revisión interna.</div>`;
};

const onSubmit=async e=>{
  e.preventDefault();
  if(ST.sending)return;
  const err=validate();
  if(err)return setMsg(err,"bad");
  setBusy(true);
  setMsg("Enviando registro...");
  try{
    const r=await fetch(ENDPOINT,{method:"POST",body:buildFormData()});
    const j=await readJsonSafe(r);
    if(!r.ok)throw new Error(j?.error||j?.message||j?.raw||"No se pudo enviar el registro.");
    setMsg("Registro enviado correctamente.","ok");
    renderSuccess(j);
  }catch(err){
    setMsg(err?.message||"Hubo un error al enviar.","bad");
    setBusy(false);
  }
};

const bind=()=>{
  $("#btnClear").addEventListener("click",clearAll);
  $("#registroForm").addEventListener("submit",onSubmit);
};

bind();
setMsg("Listo para registrar tu información.");
