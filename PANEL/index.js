import { supabase, markLoginNow, msg } from "./supabase.js";
import { $, show, hide } from "./global.js";

const showErr=t=>{ $("#err").textContent=t||"Error"; show("#err"); hide("#ok"); };
const showOk=t=>{ $("#ok").textContent=t||""; show("#ok"); hide("#err"); };

const safeSession=async(ms=3500)=>Promise.race([supabase.auth.getSession(),new Promise(r=>setTimeout(()=>r({data:{session:null},error:new Error("SESSION_TIMEOUT")}),ms))]);
const boot = async () => {
  $("#loginForm")?.addEventListener("submit", async e => {
    
    e.preventDefault();
    hide("#err"); hide("#ok");
    const email=$("#email").value.trim(), password=$("#password").value;
    if(!email || !password) return showErr("Escribe tu correo y contraseña.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) return showErr(msg(error));
    markLoginNow();
    location.href="dashboard.html";
  });

  $("#forgotBtn")?.addEventListener("click", async () => {
    hide("#err"); hide("#ok");
    const email=$("#email").value.trim();
    if(!email) return showErr("Escribe tu correo primero.");
    const { error } = await supabase.auth.resetPasswordForEmail(email,{ redirectTo: location.origin + location.pathname });
    if(error) return showErr(msg(error));
    showOk("Te envié un correo para restablecer tu contraseña.");
  });

  supabase.auth.onAuthStateChange(async ev => {
    if(ev==="PASSWORD_RECOVERY"){
      const newPass=prompt("Escribe tu nueva contraseña:");
      if(!newPass || newPass.length<8) return showErr("La nueva contraseña debe tener al menos 8 caracteres.");
      const { error } = await supabase.auth.updateUser({ password:newPass });
      if(error) return showErr(msg(error));
      showOk("Contraseña actualizada. Ahora puedes iniciar sesión.");
      history.replaceState({},document.title,location.pathname);
    }
  });
};

document.addEventListener("DOMContentLoaded",()=>boot().catch(err=>showErr(msg(err))));
