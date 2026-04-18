export const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
export const esc=v=>(v??"").toString().replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
export const norm=v=>(v||"").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
export const qp=k=>new URLSearchParams(location.search).get(k); 
 
export const show=v=>{const el=typeof v==="string"?$(v):v;el?.classList.remove("hidden");el?.classList.add("open");el?.removeAttribute("hidden");return el};
export const hide=v=>{const el=typeof v==="string"?$(v):v;el?.classList.add("hidden");el?.classList.remove("open");el?.setAttribute("hidden","hidden");return el};

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
export const setRayitoItems=items=>{const p=$("#rayito-panel");if(!p)return;const arr=(items||[]).filter(Boolean);p.innerHTML=`<div class="list">${arr.length?arr.map((x,i)=>`<button class="mini" type="button" data-rayito="${i}">${esc(x.label||`Acción ${i+1}`)}</button>`).join(""):`<div class="mut">Sin acciones</div>`}</div>`;p.querySelectorAll("[data-rayito]").forEach(b=>b.addEventListener("click",()=>{const fn=arr[+b.dataset.rayito]?.onClick;try{fn&&fn()}catch(err){console.error(err)}}))}

document.addEventListener("DOMContentLoaded",()=>{initTheme();initThemeToggle()});
const APP_MENU={
  soporte:[
    {key:"dashboard",label:"Inicio",href:"dashboard.html",icon:"⌂"},
    {key:"tickets",label:"Tickets",href:"tickets.html",icon:"🎫",badge:"open"},
    {key:"clientes",label:"Clientes",href:"cliente.html",icon:"👥"},
    {key:"altas",label:"Altas",href:"altas.html",icon:"＋"},
    {key:"servers",label:"Servidores",icon:"☁️",children:[{panel:"infra_vps",label:"VPS / VDI"},{panel:"infra_anydesk",label:"Accesos AnyDesk"}]},
    {key:"polizas",label:"Pólizas",panel:"polizas",icon:"🛡️"},
    {key:"recent_clients",label:"Últimos clientes",panel:"recent_clients",icon:"🕘"}
  ],
  ventas:[
    {key:"dashboard",label:"Inicio",href:"dashboard.html",icon:"⌂"},
    {key:"tickets",label:"Tickets",href:"tickets.html",icon:"🎫",badge:"open"},
    {key:"clientes",label:"Clientes",href:"cliente.html",icon:"👥"},
    {key:"altas",label:"Altas",href:"altas.html",icon:"＋"},
    {key:"polizas",label:"Pólizas",panel:"polizas",icon:"🛡️"},
    {key:"ventas",label:"Ventas",icon:"📈",children:[{panel:"oportunidades",label:"Oportunidades"},{panel:"renovaciones",label:"Renovaciones"}]}
  ],
  admin:[
    {key:"dashboard",label:"Inicio",href:"dashboard.html",icon:"⌂"},
    {key:"tickets",label:"Tickets",href:"tickets.html",icon:"🎫",badge:"open"},
    {key:"clientes",label:"Clientes",href:"cliente.html",icon:"👥"},
    {key:"altas",label:"Altas",href:"altas.html",icon:"＋"},
    {key:"servers",label:"Servidores",icon:"☁️",children:[{panel:"infra_vps",label:"VPS / VDI"},{panel:"infra_anydesk",label:"Accesos AnyDesk"}]},
    {key:"polizas",label:"Pólizas",panel:"polizas",icon:"🛡️"},
    {key:"recent_clients",label:"Últimos clientes",panel:"recent_clients",icon:"🕘"},
    {key:"ventas",label:"Ventas",icon:"📈",children:[{panel:"oportunidades",label:"Oportunidades"},{panel:"renovaciones",label:"Renovaciones"}]},
    {key:"admin_tools",label:"Admin",panel:"admin_tools",icon:"⚙️"}
  ]
};

const roleKey=r=>{const x=norm(r||"soporte");return x==="admin"?"admin":x==="ventas"||x==="venta"||x==="sales"?"ventas":"soporte"};
const pageTitleMap={dashboard:"Dashboard interno",tickets:"Tickets",ticket:"Ticket",clientes:"Clientes",cliente:"Cliente",altas:"Altas"};
const breadcrumbHtml=page=>`<nav class="crumbs" aria-label="Ruta"><a href="dashboard.html">Panel</a><span>/</span><span>${esc(pageTitleMap[page]||page||"Vista")}</span></nav>`;
const railItemHtml=item=>item.children?`<div class="rail-group"><button class="rail-link rail-parent" type="button" data-rail-parent="${esc(item.key)}"><span class="rail-ic">${item.icon||"•"}</span><span class="rail-tx">${esc(item.label)}</span><span class="rail-caret">›</span></button><div class="rail-sub" data-rail-sub="${esc(item.key)}">${item.children.map(x=>`<button class="rail-sublink" type="button" data-open-panel="${esc(x.panel)}">${esc(x.label)}</button>`).join("")}</div></div>`:item.panel?`<button class="rail-link" type="button" data-open-panel="${esc(item.panel)}">${item.icon?`<span class="rail-ic">${item.icon}</span>`:""}<span class="rail-tx">${esc(item.label)}</span></button>`:`<a class="rail-link" href="${esc(item.href)}" data-nav="${esc(item.key)}">${item.icon?`<span class="rail-ic">${item.icon}</span>`:""}<span class="rail-tx">${esc(item.label)}</span>${item.badge==="open"?`<span class="rail-badge" id="railOpenCount">0</span>`:""}</a>`;
const railHtml=(role,page)=>`<aside class="app-rail" id="appRail"><button class="rail-toggle" id="railToggle" type="button" aria-label="Abrir menú">☰</button><div class="rail-brand"><div class="rail-logo">✦</div><div class="rail-copy"><div class="rail-eyebrow">Expiriti</div><div class="rail-title">Panel interno</div></div></div><nav class="rail-nav">${(APP_MENU[role]||APP_MENU.soporte).map(railItemHtml).join("")}</nav><div class="rail-foot"><button class="rail-help" type="button" data-open-panel="shortcuts">Atajos</button></div></aside><div class="app-scrim" id="appScrim"></div>`;
const panelHtml=()=>`<div class="app-panel-backdrop" id="appPanelBackdrop"></div><aside class="app-panel app-panel-left" id="appPanel" aria-hidden="true"><div class="app-panel-head"><div><div class="app-panel-title" id="appPanelTitle">Panel</div><div class="app-panel-sub" id="appPanelSub">Vista interna</div></div><button class="close-x" id="appPanelClose" type="button" aria-label="Cerrar panel">×</button></div><div class="app-panel-body" id="appPanelBody"></div></aside>`;
const topbarHtml=({page,title="",kicker="",actionsHtml=""}={})=>`<header class="topbar app-topbar"><div class="topbar-inner"><div class="brand-wrap">${breadcrumbHtml(page)}<div class="brand-eyebrow">${esc(kicker||"Expiriti · operación interna")}</div><div class="brand">${esc(title||pageTitleMap[page]||"Panel interno")}</div></div><div class="topbar-center"><div class="global-search"><input class="input" id="globalSearchInput" placeholder="Buscar clientes, tickets, páginas, sistemas..." autocomplete="off"><div class="suggest-panel hidden" id="globalSearchSuggest" hidden></div></div></div><div class="top-actions">${actionsHtml||`<button class="btn" data-theme-toggle>🌓 <span data-theme-label>Claro</span></button>`}</div></div></header>`;
export const ensureAppShell=({page,title="",kicker="",actionsHtml="",role="soporte"}={})=>{const shell=$("#appShell");if(!shell)return;const mountedRail=shell.querySelector("#appRail"),mountedPanel=shell.querySelector("#appPanel"),mountedTopbar=shell.querySelector(".topbar"),rk=roleKey(role);if(mountedRail&&mountedPanel&&mountedTopbar){setAppRole(rk);bindGlobalSearch();if(page)shell.querySelector(`[data-nav="${page}"]`)?.classList.add("is-active");return}shell.innerHTML=`${railHtml(rk,page)}${panelHtml()}${topbarHtml({page,title,kicker,actionsHtml})}`;initAppRail(page);initAppPanel();setAppRole(rk);bindGlobalSearch()};

const APP_PANEL_MAP={
  infra_vps:{title:"Servidores",sub:"VPS / VDI",html:`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Servidores</div><div class="panel-v">Consulta rápida de VPS / VDI para soporte operativo.</div></div></div><div class="panel-card"><div class="panel-kv"><div class="panel-k">Qué conviene ver aquí</div><div class="panel-v">Cliente, IP o ID, usuario, password, notas, horario de soporte, versión de Windows Server, SQL, respaldo y riesgo técnico.</div></div></div>`},
  infra_anydesk:{title:"Servidores",sub:"Accesos AnyDesk",html:`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Accesos AnyDesk</div><div class="panel-v">Consulta rápida por cliente, alias, ID y notas internas.</div></div></div><div class="panel-card"><div class="panel-kv"><div class="panel-k">Uso sugerido</div><div class="panel-v">Úsalo para accesos recurrentes. Si el acceso cambia mucho, mejor dejarlo también en cliente.html.</div></div></div>`},
  polizas:{title:"Pólizas",sub:"Vista interna de seguimiento",html:`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Pólizas</div><div class="panel-v">Clientes con póliza, contexto reciente y acceso rápido a seguimiento.</div></div></div>`},
  oportunidades:{title:"Ventas",sub:"Oportunidades",html:`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Matriz de oportunidades</div><div class="panel-v">Cruce comercial entre sistemas actuales, faltantes y próxima acción.</div></div></div>`},
  renovaciones:{title:"Ventas",sub:"Renovaciones",html:`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Renovaciones</div><div class="panel-v">Seguimiento comercial y operativo para cartera por vencer o vencida.</div></div></div>`},
  admin_tools:{title:"Admin",sub:"Herramientas",html:`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Admin</div><div class="panel-v">Vista reservada para herramientas administrativas.</div></div></div>`},
  recent_clients:{title:"Clientes recientes",sub:"Últimos clientes vistos",html:`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Clientes recientes</div><div class="panel-v" id="recentClientsBody">Aún no hay clientes recientes.</div></div></div>`},
  shortcuts:{title:"Atajos de teclado",sub:"Accesos rápidos globales",html:`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Atajos</div><div class="panel-v">/ → Buscar<br>i d → Ir a inicio<br>i t → Ir a tickets<br>n t → Nuevo ticket<br>esc → Cerrar panel o modal<br>? → Ver esta ayuda</div></div></div>`}
};
export const pushRecentClient=client=>{try{if(!client?.id||!client?.nombre)return;const key="expiriti_recent_clients",cur=JSON.parse(localStorage.getItem(key)||"[]"),next=[{id:String(client.id),nombre:String(client.nombre)} ,...cur.filter(x=>String(x.id)!==String(client.id))].slice(0,8);localStorage.setItem(key,JSON.stringify(next))}catch{}};
export const readRecentClients=()=>{try{return JSON.parse(localStorage.getItem("expiriti_recent_clients")||"[]")}catch{return[]}};
export const setRailOpenCount=count=>{const el=$("#railOpenCount");if(el)el.textContent=String(count??0)};
export const setBreadcrumb=(items=[])=>{const el=$(".crumbs");if(!el||!items.length)return;el.innerHTML=items.map((x,i)=>x.href?`<a href="${esc(x.href)}">${esc(x.label)}</a>`:`<span>${esc(x.label)}</span>`).join("<span>/</span>")};
export const openAppPanel=({title="Panel",sub="Vista interna",html=""}={})=>{const p=$("#appPanel"),b=$("#appPanelBackdrop");if(!p)return;$("#appPanelTitle")&&($("#appPanelTitle").textContent=title);$("#appPanelSub")&&($("#appPanelSub").textContent=sub);$("#appPanelBody")&&($("#appPanelBody").innerHTML=html);p.setAttribute("aria-hidden","false");p.classList.add("open");if(window.innerWidth<=980)b?.classList.add("open");else b?.classList.remove("open")};
export const closeAppPanel=()=>{const p=$("#appPanel");p?.classList.remove("open");p?.setAttribute("aria-hidden","true");$("#appPanelBackdrop")?.classList.remove("open")};
export const initAppPanel=()=>{if(document.documentElement.dataset.appPanelBound)return;document.documentElement.dataset.appPanelBound="1";document.addEventListener("click",e=>{if(e.target.closest("#appPanelClose")||e.target.closest("#appPanelBackdrop"))return closeAppPanel();const op=e.target.closest("[data-open-panel]");if(!op)return;const key=op.dataset.openPanel;if(key==="recent_clients"){const items=readRecentClients(),html=items.length?`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Últimos clientes vistos</div><div class="panel-v">${items.map(x=>`<button class="btn" type="button" data-recent-client="${esc(x.id)}" data-recent-name="${esc(x.nombre)}">${esc(x.nombre)}</button>`).join(" ")}</div></div></div>`:`<div class="panel-card"><div class="panel-kv"><div class="panel-k">Últimos clientes vistos</div><div class="panel-v">Aún no hay clientes recientes.</div></div></div>`;return openAppPanel({title:"Clientes recientes",sub:"Últimos clientes vistos",html})}const cfg=APP_PANEL_MAP[key];if(cfg)return openAppPanel(cfg)});document.addEventListener("keydown",e=>{const tag=(document.activeElement?.tagName||"").toLowerCase(),typing=["input","textarea","select"].includes(tag)||document.activeElement?.isContentEditable,k=(e.key||"").toLowerCase();if((e.metaKey||e.ctrlKey)&&e.shiftKey&&k==="a"){e.preventDefault();return openAppPanel(APP_PANEL_MAP.shortcuts)}if((e.metaKey||e.ctrlKey)&&k==="b"){e.preventDefault();return document.querySelector("#globalSearchInput,#searchInput,#tkSearch")?.focus()}if(e.key==="Escape")return closeAppPanel();if(typing&&e.key!=="/")return;if(e.key==="?"){e.preventDefault();return openAppPanel(APP_PANEL_MAP.shortcuts)}if(e.key==="/"){e.preventDefault();return document.querySelector("#globalSearchInput,#searchInput,#tkSearch")?.focus()}if(k==="i"){window.__exp_next_key="pending_i";clearTimeout(window.__exp_next_key_timer);window.__exp_next_key_timer=setTimeout(()=>window.__exp_next_key="",700);return}if(k==="n"){window.__exp_next_key="pending_n";clearTimeout(window.__exp_next_key_timer);window.__exp_next_key_timer=setTimeout(()=>window.__exp_next_key="",700);return}if(k==="d"&&window.__exp_next_key==="pending_i"){window.__exp_next_key="";return location.href="dashboard.html"}if(k==="t"&&window.__exp_next_key==="pending_i"){window.__exp_next_key="";return location.href="tickets.html"}if(k==="t"&&window.__exp_next_key==="pending_n"){window.__exp_next_key="";return document.querySelector("#heroNewTicketBtn,#newTicketTopBtn,#tkNewBtn")?.click()}});document.addEventListener("click",e=>{const b=e.target.closest("[data-recent-client]");if(!b)return;location.href=`cliente.html?id=${b.dataset.recentClient}`})};
export const setAppRole=role=>{const r=norm(role||"soporte"),isSupport=["soporte","support"].includes(r),isSales=["ventas","venta","sales"].includes(r),isAdmin=r==="admin";document.querySelectorAll("[data-role-only]").forEach(el=>{const need=(el.getAttribute("data-role-only")||"").split(/\s+/).filter(Boolean),ok=need.includes("admin")&&isAdmin||need.includes("soporte")&&isSupport||need.includes("ventas")&&isSales||need.includes("support")&&isSupport;el.hidden=!ok})};
export const initAppRail=page=>{const rail=$("#appRail"),scrim=$("#appScrim"),toggle=$("#railToggle");if(!rail)return;const mobile=()=>window.matchMedia("(max-width: 980px)").matches;if(!rail.dataset.bound){rail.dataset.bound="1";toggle?.addEventListener("click",()=>{rail.classList.toggle("open");scrim?.classList.toggle("open",rail.classList.contains("open"))});scrim?.addEventListener("click",()=>{rail.classList.remove("open");scrim.classList.remove("open")});rail.querySelectorAll("[data-rail-parent]").forEach(b=>{b.addEventListener("click",e=>{if(!mobile())return;e.preventDefault();b.closest(".rail-group")?.classList.toggle("open")})})}rail.querySelectorAll("[data-nav]").forEach(x=>x.classList.remove("is-active"));if(page)rail.querySelector(`[data-nav="${page}"]`)?.classList.add("is-active")};

const GLOBAL_PAGES=[
  {type:"pagina",id:"dashboard",label:"Dashboard",href:"dashboard.html",sub:"Vista general"},
  {type:"pagina",id:"tickets",label:"Tickets",href:"tickets.html",sub:"Mesa operativa"},
  {type:"pagina",id:"ticket",label:"Ticket",href:"ticket.html",sub:"Detalle"},
  {type:"pagina",id:"cliente",label:"Cliente",href:"cliente.html",sub:"Detalle de cliente"},
  {type:"pagina",id:"altas",label:"Altas",href:"altas.html",sub:"Mesa de altas"}
];
let __globalSearchBound=0,__globalSearchData={clientes:[],tickets:[],extras:[]};
export const setGlobalSearchData=({clientes=[],tickets=[],extras=[]}={})=>{__globalSearchData={clientes,tickets,extras:[...GLOBAL_PAGES,...extras]}};
const globalSuggestRows=q=>{const x=norm(q);if(!x||x.length<1)return[];const out=[];(__globalSearchData.extras||[]).forEach(p=>{if(norm(`${p.label} ${p.sub||""} ${p.id||""}`).includes(x))out.push({k:`p_${p.id}`,type:p.type||"pagina",label:p.label,sub:p.sub||"",href:p.href})});(__globalSearchData.clientes||[]).forEach(c=>{if(norm(`${c.nombre||""} ${c.alias||""} ${c.correo||""}`).includes(x))out.push({k:`c_${c.id}`,type:"cliente",label:c.nombre||"Sin nombre",sub:"Cliente",href:`cliente.html?id=${c.id}`})});(__globalSearchData.tickets||[]).forEach(t=>{if(norm(`${t.titulo||""} ${t.descripcion||""} ${t.tipo||""} ${t.estado||""} ${t.prioridad||""} ${t.clientes?.nombre||""}`).includes(x))out.push({k:`t_${t.id}`,type:"ticket",label:t.titulo||`Ticket ${t.id}`,sub:`${t.clientes?.nombre||"Sin cliente"} · ${t.estado||"abierto"}`,href:`ticket.html?id=${t.id}`})});return [...new Map(out.map(x=>[x.k,x])).values()].slice(0,8)};
const renderGlobalSuggest=()=>{const box=$("#globalSearchSuggest"),input=$("#globalSearchInput"),items=globalSuggestRows(input?.value||"");if(!box)return;box.innerHTML=items.length?items.map(x=>`<a class="item suggest-item" href="${esc(x.href)}"><div class="item-title">${esc(x.label)}</div><div class="item-meta">${esc(x.type)} · ${esc(x.sub||"")}</div></a>`).join(""):"";box.classList.toggle("hidden",!items.length);if(items.length)box.removeAttribute("hidden");else box.setAttribute("hidden","hidden")};
export const bindGlobalSearch=()=>{if(__globalSearchBound)return;__globalSearchBound=1;document.addEventListener("input",e=>{if(e.target?.id==="globalSearchInput")renderGlobalSuggest()});document.addEventListener("focusin",e=>{if(e.target?.id==="globalSearchInput")renderGlobalSuggest()});document.addEventListener("click",e=>{if(!e.target.closest(".global-search"))hide("#globalSearchSuggest")})};

export const fmtDT=v=>v?new Date(v).toLocaleString("es-MX"):"—";
export const daysSince=v=>v?Math.floor((Date.now()-new Date(v).getTime())/864e5):999;
export const prettyBytes=n=>{const x=Number(n||0);return x>=1048576?`${(x/1048576).toFixed(1)} MB`:x>=1024?`${Math.max(1,Math.round(x/1024))} KB`:`${x} B`};
export const ticketStateKey=v=>{const x=norm(v);if(["abierto","nuevo"].includes(x))return"abierto";if(["en_proceso","en proceso","proceso"].includes(x))return"en_proceso";if(["esperando_cliente","esperando cliente","espera"].includes(x))return"esperando_cliente";if(["resuelto"].includes(x))return"resuelto";if(["cerrado","closed","done","cancelado"].includes(x))return"cerrado";return"abierto"};
export const ticketStateLabel=v=>ticketStateKey(v)==="en_proceso"?"En proceso":ticketStateKey(v)==="esperando_cliente"?"Esperando cliente":ticketStateKey(v)==="resuelto"?"Resuelto":ticketStateKey(v)==="cerrado"?"Cerrado":"Abierto";
export const ticketStateCls=v=>{const x=ticketStateKey(v);return x==="resuelto"||x==="cerrado"?"ok":x==="esperando_cliente"?"warn":x==="en_proceso"?"info":"neutral"};
export const ticketPriorityCls=v=>{const x=norm(v);return x==="urgente"?"bad":x==="alta"?"warn":x==="media"?"info":"ok"};


