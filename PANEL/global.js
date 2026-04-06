export const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];

export const esc=v=>(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

export const show=id=>{$(id)?.classList.remove("hidden");$(id)?.removeAttribute("hidden")},hide=id=>{$(id)?.classList.add("hidden");$(id)?.setAttribute("hidden","hidden")};

export const toast=(t,type="")=>{const d=document.createElement("div");d.className=`toast ${type}`;d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2500)};

export const copyTxt=(v,msg="Copiado")=>navigator.clipboard.writeText(v||"").then(()=>toast(msg,"ok"));

export const debounce=(fn,ms=300)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}};

export const norm=v=>(v||"").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();

export const bindModal=(id,closeSel)=>{const m=$(id);m?.addEventListener("click",e=>{if(e.target===m||e.target.closest(closeSel))hide(id)})};
export const qp=k=>new URLSearchParams(location.search).get(k);
/* THEME */
export const applyTheme=v=>document.documentElement.setAttribute("data-theme",v==="dark"?"dark":"light");
export const toggleTheme=()=>{const t=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";localStorage.setItem("expiriti_theme",t);applyTheme(t)};

document.addEventListener("click",e=>{if(e.target.closest("[data-theme-toggle]"))toggleTheme()});

/* RAYITO (panel flotante simple) */
export const initRayito=()=>{if($("#rayito"))return;const b=document.createElement("button");b.id="rayito";b.textContent="⚡";b.style.cssText="position:fixed;right:14px;bottom:14px;z-index:40;padding:12px;border-radius:50%;border:none;background:linear-gradient(135deg,#2dd4bf,#22c55e);cursor:pointer";document.body.appendChild(b);const panel=document.createElement("div");panel.id="rayito-panel";panel.className="panel hidden";panel.style.cssText="position:fixed;right:14px;bottom:70px;width:260px;z-index:40";panel.innerHTML=`<div class="list"><button class="mini">Acción 1</button><button class="mini">Acción 2</button><button class="mini">Acción 3</button></div>`;document.body.appendChild(panel);b.onclick=()=>panel.classList.toggle("hidden")};

/* INIT GLOBAL */
document.addEventListener("DOMContentLoaded",()=>{applyTheme(localStorage.getItem("expiriti_theme")||"light");initRayito()});
