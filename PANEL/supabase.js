import{createClient}from"https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const U="https://ovfmqqqwezfdtgrtkjhf.supabase.co",K="sb_publishable_2ftu336Kc06w2I2iTwoIpQ_usfSTNG9",SESSION_MAX_MS=288e5,LOGIN_TS_KEY="expiriti_login_ts";
export const supabase=createClient(U,K,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export const norm=v=>(v||"").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
export const esc=v=>(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
export const fmt=v=>{if(!v)return"";try{return new Date(v).toLocaleDateString("es-MX")}catch{return""}};
export const msg=e=>e?.message||e?.error_description||e?.details||"Error";
export function markLoginNow(){localStorage.setItem(LOGIN_TS_KEY,String(Date.now()))}
export async function guardSession(r="index.html"){const{data:{session},error}=await supabase.auth.getSession();if(error||!session){location.href=r;return null}const ts=+localStorage.getItem(LOGIN_TS_KEY)||0;if(ts&&Date.now()-ts>SESSION_MAX_MS){await supabase.auth.signOut();localStorage.removeItem(LOGIN_TS_KEY);location.href=r;return null}const{data:{user},error:uErr}=await supabase.auth.getUser();if(uErr||!user){location.href=r;return null}return{session,user}}
export async function logout(r="index.html"){await supabase.auth.signOut();localStorage.removeItem(LOGIN_TS_KEY);location.href=r}
export async function getProfile(){const{data:{user}}=await supabase.auth.getUser();if(!user)return null;const{data}=await supabase.from("perfiles").select("id,nombre,rol,tema,preferencias").eq("id",user.id).maybeSingle();return data||null}
export async function saveTheme(v,id){if(id)await supabase.from("perfiles").update({tema:v}).eq("id",id)}
export function applyTheme(v){document.documentElement.setAttribute("data-theme",v==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):v)}
export async function logAction({accion,documento_id=null,cliente_id=null,detalle={}}){const{data:{user}}=await supabase.auth.getUser();if(!user)return;await supabase.from("bitacora").insert({usuario_id:user.id,accion,documento_id,cliente_id,detalle})}
export async function openPdfSigned(path,h=8){const{data,error}=await supabase.storage.from("certificados").createSignedUrl(path,h*3600);if(error||!data?.signedUrl)throw error||new Error("Sin URL");window.open(data.signedUrl,"_blank","noopener")}
supabase.auth.onAuthStateChange(async(ev,session)=>{if(ev==="SIGNED_IN"&&session)localStorage.setItem(LOGIN_TS_KEY,String(localStorage.getItem(LOGIN_TS_KEY)||Date.now()));if(ev==="SIGNED_OUT"){localStorage.removeItem(LOGIN_TS_KEY);if(!/index\.html$/i.test(location.pathname))location.href="index.html"}if(ev==="TOKEN_REFRESHED"&&session){const ts=+localStorage.getItem(LOGIN_TS_KEY)||0;if(ts&&Date.now()-ts>SESSION_MAX_MS){await supabase.auth.signOut();localStorage.removeItem(LOGIN_TS_KEY);location.href="index.html"}}});
