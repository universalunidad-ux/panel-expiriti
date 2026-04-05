export const $=q=>document.querySelector(q);
export const $$=q=>[...document.querySelectorAll(q)];

export const toast=(msg,type="")=>{
  let el=document.createElement("div");
  el.className="toast "+type;
  el.textContent=msg;
  Object.assign(el.style,{position:"fixed",bottom:"20px",right:"20px",background:"#111927",padding:"10px 14px",border:"1px solid #333",borderRadius:"10px"});
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2500);
};

export const human=n=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} MB`:`${Math.round(n/1024)} KB`;
