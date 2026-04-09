export const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
export const esc=v=>(v??"").toString().replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
export const norm=v=>(v||"").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
export const qp=k=>new URLSearchParams(location.search).get(k);

export const show=sel=>{$(sel)?.classList.remove("hidden");$(sel)?.classList.add("open");$(sel)?.removeAttribute("hidden")};
export const hide=sel=>{$(sel)?.classList.add("hidden");$(sel)?.classList.remove("open");$(sel)?.setAttribute("hidden","hidden")};
export const toggle=sel=>{$(sel)?.classList.toggle("hidden");$(sel)?.classList.toggle("open")};

export const toast=(text,type="",ms=2600)=>{const d=document.createElement("div");d.className=`toast ${type}`.trim();d.textContent=text;document.body.appendChild(d);setTimeout(()=>d.remove(),ms)};
export const debounce=(fn,ms=220)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}};
export const copyTxt=(v,msg="Copiado")=>navigator.clipboard.writeText(v||"").then(()=>toast(msg,"ok")).catch(()=>toast("No se pudo copiar","bad"));

export const bindModal=(sel,closeSel=".close,.close-x,.icon-btn")=>{const m=$(sel);if(!m||m.dataset.bound)return;m.dataset.bound="1";m.addEventListener("click",e=>{if(e.target===m||e.target.closest(closeSel))hide(sel)})};

export const applyTheme=v=>{const t=v==="dark"?"dark":"light";document.documentElement.setAttribute("data-theme",t);const label=$("[data-theme-label]");if(label)label.textContent=t==="dark"?"Oscuro":"Claro";return t};
export const toggleTheme=()=>{const next=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";localStorage.setItem("expiriti_theme",next);applyTheme(next);return next};
export const initTheme=()=>applyTheme(localStorage.getItem("expiriti_theme")||"light");

export const initThemeToggle=()=>{if(document.documentElement.dataset.themeBound)return;document.documentElement.dataset.themeBound="1";document.addEventListener("click",e=>{if(e.target.closest("[data-theme-toggle]"))toggleTheme()})};

export const initRayito=()=>{if($("#rayito"))return;const b=document.createElement("button");b.id="rayito";b.type="button";b.textContent="⚡";b.style.cssText="position:fixed;right:14px;bottom:14px;z-index:80;width:52px;height:52px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(135deg,#2dd4bf,#60a5fa);color:#041018;font-size:20px;font-weight:900;box-shadow:0 12px 30px rgba(0,0,0,.22);cursor:pointer";const p=document.createElement("div");p.id="rayito-panel";p.className="panel hidden";p.style.cssText="position:fixed;right:14px;bottom:74px;width:260px;z-index:79";p.innerHTML=`<div class="list"><button class="mini" type="button">Acción 1</button><button class="mini" type="button">Acción 2</button><button class="mini" type="button">Acción 3</button></div>`;document.body.appendChild(b);document.body.appendChild(p);b.addEventListener("click",()=>toggle("#rayito-panel"))};

document.addEventListener("DOMContentLoaded",()=>{initTheme();initThemeToggle()});
