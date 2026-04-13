.page{min-height:100vh;display:grid;place-items:center;padding:24px}
.shell{width:min(1240px,100%);display:grid;grid-template-columns:minmax(420px,.98fr) minmax(560px,1.02fr);gap:18px;align-items:stretch}
.hero{display:grid;grid-template-rows:auto 1fr;gap:18px;padding:26px;min-height:720px;background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 88%,transparent),color-mix(in srgb,var(--panel-2) 96%,transparent)),linear-gradient(90deg,color-mix(in srgb,var(--brand) 10%,transparent),transparent 42%,color-mix(in srgb,var(--brand-2) 8%,transparent))}
.hero-top{display:grid;gap:18px}
.hero-copy{display:grid;gap:18px;align-content:start}
.hero-title{margin:0;font-size:clamp(38px,5vw,56px);line-height:.95;font-weight:950;letter-spacing:-.05em;max-width:9ch}
.hero-sub{margin:0;font-size:15px;line-height:1.6;color:var(--muted);max-width:58ch}
.hero-points{display:grid;gap:12px}
.point{display:grid;grid-template-columns:30px 1fr;gap:12px;padding:16px;border:1px solid var(--line);border-radius:18px;background:color-mix(in srgb,var(--panel-2) 82%,transparent)}
.point-ico{display:grid;place-items:center;width:30px;height:30px;border-radius:12px;background:color-mix(in srgb,var(--brand) 14%,transparent)}
.point strong{display:block;font-size:15px}
.point p{margin:6px 0 0;font-size:13px;line-height:1.5;color:var(--muted)}
.panel{padding:24px;display:grid;align-content:start}
.panel-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:18px}
.panel-title{margin:8px 0 0;font-size:clamp(28px,3vw,40px);line-height:1.02;font-weight:950;letter-spacing:-.04em}
.panel-sub{margin:8px 0 0;color:var(--muted);max-width:58ch}
.form{display:grid;gap:16px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.field{display:block;min-width:0}
.field-full{grid-column:1/-1}
.field span{display:block;margin-bottom:7px;font-size:12px;color:var(--muted)}
.area{min-height:108px}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.actions .btn{min-width:210px}
.trust-box{display:grid;gap:8px;padding:16px;border:1px solid var(--line);border-radius:18px;background:color-mix(in srgb,var(--panel-2) 96%,transparent)}
.trust-head{font-size:13px;font-weight:900;letter-spacing:.04em}
.trust-copy{margin:0;font-size:13px;line-height:1.55;color:var(--muted)}
.trust-link{font-size:13px;font-weight:800;text-decoration:none}
.checkline{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;font-size:13px;line-height:1.5}
.status,.foot-note{font-size:12px;color:var(--muted)}
@media(max-width:1120px){.shell{grid-template-columns:1fr}.hero{min-height:auto}}
@media(max-width:760px){.page{padding:14px}.hero,.panel{padding:20px}.grid{grid-template-columns:1fr}.actions{display:grid}.actions .btn{width:100%;min-width:0}.panel-top{flex-direction:column}}
