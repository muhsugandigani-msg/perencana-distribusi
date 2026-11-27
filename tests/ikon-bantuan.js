const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch();for(const W of [1300,390]){const p=await b.newPage({viewport:{width:W,height:W<600?844:900},hasTouch:W<600});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const d=JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json'));const st=d.state||d;st.savedPlan=null;st.params.optimasiMendalam=false;
await p.addInitScript(s=>{try{if(!sessionStorage.getItem('x')){localStorage.setItem('perencana-distribusi-v1',s);sessionStorage.setItem('x',1)}}catch(e){}},JSON.stringify(st));
await p.goto(process.env.AU_URL);await p.waitForTimeout(1200);
const res={};
for(const t of ['kendaraan','store','istirahat','parameter']){await p.click(`[data-tab="${t}"]`);await p.waitForTimeout(400);res[t]=await p.evaluate(()=>({q:document.querySelectorAll('main .panel:not([hidden]) .qhelp').length,visHelp:[...document.querySelectorAll('main .panel:not([hidden]) .help')].filter(e=>e.offsetParent).length}));await p.screenshot({path:`hp_${W}_${t}.png`});}
await p.click('#btnPlan');await p.waitForTimeout(3000);for(const t of ['plan','gantt','peta']){await p.click(`[data-tab="${t}"]`);await p.waitForTimeout(800);res[t]=await p.evaluate(()=>({q:document.querySelectorAll('main .panel:not([hidden]) .qhelp').length,visHelp:[...document.querySelectorAll('main .panel:not([hidden]) .help')].filter(e=>e.offsetParent).length}));}
await p.click('[data-tab="parameter"]');await p.waitForTimeout(400);
const q=p.locator('main .panel:not([hidden]) .qhelp').nth(2);
if(W<600){await q.tap();}else{await q.hover();}await p.waitForTimeout(200);
const tip=await p.evaluate(()=>{const b=document.getElementById('qtipBox');const r=b.getBoundingClientRect();return {vis:!b.hidden,txt:b.textContent.slice(0,60),l:Math.round(r.left),r:Math.round(r.right),vw:document.documentElement.clientWidth}});
await p.screenshot({path:`hp_${W}_tip.png`});
// checkbox tidak ikut tercentang saat klik "?"
const chk=await p.evaluate(()=>state.params.fairness.aktif);const fq=p.locator('label.chk:has([data-k="params.fairness.aktif"]) .qhelp');let after=null;if(await fq.count()){await fq.click();await p.waitForTimeout(200);after=await p.evaluate(()=>state.params.fairness.aktif);}
console.log(W,JSON.stringify(res),JSON.stringify(tip),'fairness',chk,'->',after,errs);await p.close();}
await b.close();})();
