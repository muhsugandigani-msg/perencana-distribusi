const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const errs=[];
for (const [w,h] of [[1920,972],[1366,768],[390,844]]){const p=await b.newPage({viewport:{width:w,height:h}});p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/local.html#peta');await p.waitForTimeout(800);
const r=await p.evaluate(()=>({sh:document.documentElement.scrollHeight,ih:innerHeight,map:document.getElementById('map').getBoundingClientRect().height}));
await p.screenshot({path:`fit_peta_${w}.png`});
await p.click('[data-tab=gantt]');await p.waitForTimeout(300);
const g=await p.evaluate(()=>{const e=document.getElementById('gantt');return {sh:document.documentElement.scrollHeight,gh:e.getBoundingClientRect().height,gsh:e.scrollHeight}});
await p.screenshot({path:`fit_gantt_${w}.png`});
await p.click('[data-tab=store]');await p.waitForTimeout(200);const st=await p.evaluate(()=>document.documentElement.scrollHeight);
console.log(w,h,JSON.stringify({r,g,st}));await p.close();}
console.log(errs);await b.close();})();
