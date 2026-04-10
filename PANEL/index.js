import { supabase, markLoginNow, msg } from "./supabase.js";
import { $, show, hide } from "./global.js";

const showErr=t=>{ $("#err").textContent=t||"Error"; show("#err"); hide("#ok"); };
const showOk=t=>{ $("#ok").textContent=t||""; show("#ok"); hide("#err"); };

const boot = async () => {
  const { data:{ session } } = await supabase.auth.getSession();
  if(session && !location.hash.includes("type=recovery")) location.href="dashboard.html";

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
