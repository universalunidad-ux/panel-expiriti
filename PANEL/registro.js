const $=q=>document.querySelector(q),ST={sending:false},ENDPOINT="https://ovfmqqqwezfdtgrtkjhf.supabase.co/functions/v1/submit-registro";
const esc=v=>(v??"").toString().replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])),digits=v=>(v||"").replace(/\D+/g,""),mailOk=v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const setBusy=v=>{ST.sending=!!v;$("#btnSubmit").disabled=ST.sending;$("#btnClear").disabled=ST.sending};
const setMsg=(t,x="")=>{const e=$("#statusMsg");e.textContent=t;e.className=`status ${x}`.trim();$("#statePill").textContent=x==="ok"?"Enviado":x==="bad"?"Error":x==="warn"?"Atención":ST.sending?"Enviando":"Listo"};

const toggleAltContact=()=>{const b=$("#altContactBlock"),n=$("#toggleAltContactBtn");if(!b||!n)return;const o=b.hasAttribute("hidden");b.toggleAttribute("hidden",!o);n.setAttribute("aria-expanded",o?"true":"false");n.textContent=o?"Ocultar contacto adicional":"Agregar contacto adicional"};

const clearAll=()=>{if(ST.sending)return;$("#registroForm").reset();const b=$("#altContactBlock"),n=$("#toggleAltContactBtn");b&&b.setAttribute("hidden","");n&&(n.textContent="Agregar contacto adicional",n.setAttribute("aria-expanded","false"));setMsg("Listo para registrar tu información.")};

const validate=()=>{
const empresa=$("#empresa").value.trim(),correoEmpresa=$("#correoEmpresa").value.trim(),telefonoEmpresa=digits($("#telefonoEmpresa").value),contactoNombre=$("#contactoNombre").value.trim(),contactoCorreo=$("#contactoCorreo").value.trim(),contactoTelefono=digits($("#contactoTelefono").value),contactoWhatsapp=digits($("#contactoWhatsapp").value),altCorreo=$("#contactoAltCorreo").value.trim(),altTelefono=digits($("#contactoAltTelefono").value),ok=$("#acceptData").checked;
if(!empresa)return"Falta la razón social o nombre comercial.";
if(correoEmpresa&&!mailOk(correoEmpresa))return"El correo principal empresa no parece válido.";
if($("#telefonoEmpresa").value.trim()&&telefonoEmpresa.length<10)return"El teléfono principal empresa parece incompleto.";
if(!contactoNombre)return"Falta el nombre del contacto principal.";
if(contactoCorreo&&!mailOk(contactoCorreo))return"El correo del contacto principal no parece válido.";
if($("#contactoTelefono").value.trim()&&contactoTelefono.length<10)return"El teléfono del contacto principal parece incompleto.";
if($("#contactoWhatsapp").value.trim()&&contactoWhatsapp.length<10)return"El WhatsApp del contacto principal parece incompleto.";
if(altCorreo&&!mailOk(altCorreo))return"El correo del contacto alterno no parece válido.";
if($("#contactoAltTelefono").value.trim()&&altTelefono.length<10)return"El teléfono del contacto alterno parece incompleto.";
if(!ok)return"Debes confirmar el tratamiento de datos para continuar.";
return""
};

const buildFormData=()=>{
const fd=new FormData(),a=(k,v)=>fd.append(k,v);
a("empresa",$("#empresa").value.trim());a("correo_empresa",$("#correoEmpresa").value.trim());a("telefono_empresa",digits($("#telefonoEmpresa").value));
a("contacto_nombre",$("#contactoNombre").value.trim());a("contacto_puesto",$("#contactoPuesto").value.trim());a("contacto_correo",$("#contactoCorreo").value.trim());
a("contacto_telefono",digits($("#contactoTelefono").value));a("contacto_whatsapp",digits($("#contactoWhatsapp").value));a("metodo_contacto_preferido",$("#metodoContacto").value);
a("horario_contacto",$("#horarioContacto").value.trim());a("cumpleanos_contacto",$("#cumpleanos").value);
a("contacto_alterno_nombre",$("#contactoAltNombre").value.trim());a("contacto_alterno_puesto",$("#contactoAltPuesto").value.trim());
a("contacto_alterno_correo",$("#contactoAltCorreo").value.trim());a("contacto_alterno_telefono",digits($("#contactoAltTelefono").value));
a("comentarios",$("#comentarios").value.trim());a("origen","registro_publico");
return fd
};

const readJsonSafe=async r=>{const t=await r.text();try{return t?JSON.parse(t):{}}catch{return{raw:t}}};

const renderSuccess=j=>{
const empresa=esc($("#empresa").value.trim()),contacto=esc($("#contactoNombre").value.trim());
$(".panel").innerHTML=`<div class="panel-top"><div><div class="section-kicker">Registro enviado</div><h2 class="panel-title">Gracias, ya recibimos tus datos</h2><p class="panel-sub">Tu información quedó enviada para validación y consolidación en tu expediente con Expiriti.</p></div><span class="state-pill">Enviado</span></div><div class="status ok">✅ Registro recibido correctamente${j?.solicitud_id?`: ${esc(String(j.solicitud_id))}`:""}.</div><div class="grid" style="margin-top:16px"><div class="field"><span>Empresa</span><div class="input" style="display:flex;align-items:center">${empresa}</div></div><div class="field"><span>Contacto principal</span><div class="input" style="display:flex;align-items:center">${contacto||"Registrado"}</div></div></div><div class="foot-note">Si ya existías en nuestra base, actualizaremos tus datos. Si no, prepararemos tu registro para revisión interna.</div>`
};

const onSubmit=async e=>{
e.preventDefault();
if(ST.sending)return;
const err=validate();
if(err)return setMsg(err,"bad");
setBusy(true);setMsg("Enviando registro...");
try{
const r=await fetch(ENDPOINT,{method:"POST",body:buildFormData()}),j=await readJsonSafe(r);
if(!r.ok)throw new Error(j?.error||j?.message||j?.raw||"No se pudo enviar el registro.");
setMsg("Registro enviado correctamente.","ok");renderSuccess(j);
}catch(err){setMsg(err?.message||"Hubo un error al enviar.","bad");setBusy(false)}
};

const bind=()=>{$("#btnClear").addEventListener("click",clearAll);$("#toggleAltContactBtn")?.addEventListener("click",toggleAltContact);$("#registroForm").addEventListener("submit",onSubmit)};
bind();$("#altContactBlock")?.setAttribute("hidden","");$("#toggleAltContactBtn")?.setAttribute("aria-expanded","false");setMsg("Listo para registrar tu información.");
