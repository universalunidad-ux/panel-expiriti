
import{createClient}from"https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
const supabaseUrl="https://ovfmqqqwezfdtgrtkjhf.supabase.co",supabaseKey="sb_publishable_2ftu336Kc06w2I2iTwoIpQ_usfSTNG9";
export const supabase=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const SESSION_MAX_MS=8*60*60*1e3,LOGIN_TS_KEY="expiriti_login_ts";
export async function guardSession(redirect="index.html"){const{data:{session},error}=await supabase.auth.getSession();if(error||!session){location.href=redirect;return null}const ts=Number(localStorage.getItem(LOGIN_TS_KEY)||0);if(ts&&Date.now()-ts>SESSION_MAX_MS){await supabase.auth.signOut();localStorage.removeItem(LOGIN_TS_KEY);location.href=redirect;return null}const{data:{user},error:uErr}=await supabase.auth.getUser();if(uErr||!user){location.href=redirect;return null}return{session,user}}
export function markLoginNow(){localStorage.setItem(LOGIN_TS_KEY,String(Date.now()))}
export async function logout(redirect="index.html"){await supabase.auth.signOut();localStorage.removeItem(LOGIN_TS_KEY);location.href=redirect}
supabase.auth.onAuthStateChange(async(ev,session)=>{if(ev==="SIGNED_IN"&&session)localStorage.setItem(LOGIN_TS_KEY,String(localStorage.getItem(LOGIN_TS_KEY)||Date.now()));if(ev==="SIGNED_OUT"){localStorage.removeItem(LOGIN_TS_KEY);if(!/index\.html$/i.test(location.pathname))location.href="index.html"}if(ev==="TOKEN_REFRESHED"&&session){const ts=Number(localStorage.getItem(LOGIN_TS_KEY)||0);if(ts&&Date.now()-ts>SESSION_MAX_MS){await supabase.auth.signOut();localStorage.removeItem(LOGIN_TS_KEY);location.href="index.html"}}});
