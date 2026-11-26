const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const errs=[];
const tabs=['kendaraan','store','istirahat','parameter','plan','gantt','peta'];
for (const [name,vp,scheme] of [['d',{width:1440,height:900},'light'],['m',{width:390,height:844},'light'],['k',{width:1440,height:900},'dark']]){
 const ctx=await b.newContext({viewport:vp,colorScheme:scheme,deviceScaleFactor:1});const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://'+process.cwd()+'/local.html#kendaraan');await p.waitForTimeout(400);
 for(const t of (name==='k'?['store','plan','gantt']:tabs)){await p.click(`[data-tab=${t}]`);await p.waitForTimeout(t==='plan'?1500:500);await p.screenshot({path:`ux/${name}_${t}.png`});}
 const ov=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);console.log(name,'overflow',ov);
 await ctx.close();}
console.log(errs);await b.close();})();
