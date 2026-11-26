const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const d=JSON.parse(fs.readFileSync('/home/user/perencana-distribusi/data/plan-data.json'));const st=d.state||d;
await p.addInitScript(s=>{try{if(!sessionStorage.getItem('x')){sessionStorage.setItem('x',1);localStorage.clear();localStorage.setItem('perencana-distribusi-v1',s);
 // isi cache rute sampai penuh
 const pt='[-5.12345,119.45678],';let arr=[];const o={};let ok=true;let k=0;
 while(ok){const chunk=JSON.parse('['+pt.repeat(5000).slice(0,-1)+']');o['k'+k++]=chunk;try{localStorage.setItem('perencana-distribusi-v1-rute-tanpa-tol',JSON.stringify(o));}catch(e){delete o['k'+(k-1)];ok=false;}}
 for(const sz of [20000,5000,1000,200]){let ok2=true;while(ok2){try{localStorage.setItem('pad'+Math.random(),'x'.repeat(sz));}catch(e){ok2=false;}}}
}}catch(e){}},JSON.stringify(st));
await p.goto('file://'+__dirname+'/app/local.html');await p.waitForTimeout(1500);
const used=await p.evaluate(()=>{let n=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);n+=k.length+localStorage.getItem(k).length;}return n;});console.log('terpakai awal ~',(used/1e6).toFixed(2),'juta karakter');
await p.click('#btnPlan');await p.waitForTimeout(3000);
await p.evaluate(()=>commitSave());await p.waitForTimeout(500);
console.log('toast:',await p.$eval('#toast',e=>e.textContent));
console.log('tersimpan ada savedPlan:',await p.evaluate(()=>!!JSON.parse(localStorage.getItem('perencana-distribusi-v1')).savedPlan),'cache rute masih ada:',await p.evaluate(()=>localStorage.getItem('perencana-distribusi-v1-rute-tanpa-tol')!==null));
console.log('errors',errs);await b.close();})();
